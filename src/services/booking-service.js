const axios = require('axios');
const { StatusCodes } = require('http-status-codes');
const { BookingRepository } = require('../repositories');
const { ServerConfig } = require('../config');
const db = require('../models');
const AppError = require('../utils/errors/app-error');
const { Enums } = require('../utils/common');

const { BOOKED, CANCELLED, INITIATED } = Enums.BOOKING_STATUS;
const bookingRepository = new BookingRepository();

// In-memory storage for idempotency keys (consider using Redis in production)
const idempotencyStore = new Map();

/**
 * Clean up idempotency keys older than 24 hours to prevent memory leaks
 */
function cleanupOldIdempotencyKeys() {
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    for (let [key, value] of idempotencyStore.entries()) {
        if (value.timestamp && (now - value.timestamp > twentyFourHours)) {
            idempotencyStore.delete(key);
        }
    }
}

/**
 * Create a booking and reserve seats
 */
async function createBooking(data) {
    const transaction = await db.sequelize.transaction();
    try {
        const flightResponse = await axios.get(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${data.flightId}`);
        const flight = flightResponse.data.data;

        if (data.noOfSeats > flight.totalSeats) {
            throw new AppError('Not enough seats available', StatusCodes.BAD_REQUEST);
        }

        const totalBillingAmount = data.noOfSeats * flight.price;

        const bookingPayload = {
            ...data,
            totalCost: totalBillingAmount,
            status: INITIATED
        };

        const booking = await bookingRepository.create(bookingPayload, transaction);

        await axios.patch(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${data.flightId}/seats`, {
            seats: data.noOfSeats
        });

        await transaction.commit();
        return booking;

    } catch (error) {
        await transaction.rollback();
        
        if (error instanceof AppError) {
            throw error;
        }
        
        throw new AppError(
            'Failed to create booking', 
            StatusCodes.INTERNAL_SERVER_ERROR,
            error.message
        );
    }
}

/**
 * Make payment and confirm booking with idempotency
 */
async function makePayment(data, idempotencyKey = null) {
    const transaction = await db.sequelize.transaction();
    
    try {
        // Check if idempotency key is provided
        if (!idempotencyKey) {
            throw new AppError('Idempotency key is required', StatusCodes.BAD_REQUEST);
        }

        // Check if this request was already processed successfully
        if (idempotencyStore.has(idempotencyKey)) {
            const previousResponse = idempotencyStore.get(idempotencyKey);
            throw new AppError(
                'Cannot retry on a successful payment', 
                StatusCodes.BAD_REQUEST
            );
        }

        const booking = await bookingRepository.get(data.bookingId, transaction);

        if (!booking) {
            throw new AppError('Booking not found', StatusCodes.NOT_FOUND);
        }

        if (booking.status === CANCELLED) {
            throw new AppError('The booking has already been cancelled', StatusCodes.BAD_REQUEST);
        }

        if (booking.status === BOOKED) {
            throw new AppError('The booking is already confirmed', StatusCodes.BAD_REQUEST);
        }

        const bookingTime = new Date(booking.createdAt);
        const currentTime = new Date();

        // Cancel booking if it's older than 5 minutes
        if (currentTime - bookingTime > 5 * 60 * 1000) {
            await cancelBooking({ bookingId: data.bookingId });
            throw new AppError('The booking has expired', StatusCodes.BAD_REQUEST);
        }

        if (booking.totalCost !== data.totalCost) {
            throw new AppError('Payment amount mismatch', StatusCodes.BAD_REQUEST);
        }

        if (booking.userId !== data.userId) {
            throw new AppError('User does not match the booking', StatusCodes.BAD_REQUEST);
        }

        const updatedBooking = await bookingRepository.update(
            data.bookingId,
            { status: BOOKED },
            transaction
        );

        // Store the successful response with idempotency key
        const successResponse = {
            success: true,
            data: updatedBooking,
            message: 'Payment processed successfully',
            timestamp: Date.now()
        };
        
        idempotencyStore.set(idempotencyKey, successResponse);

        // Clean up old idempotency keys (to prevent memory leaks)
        cleanupOldIdempotencyKeys();

        await transaction.commit();
        return successResponse;

    } catch (error) {
        await transaction.rollback();
        
        // Don't store failed requests in idempotency store
        // Only successful payments are stored to prevent retries
        
        if (error instanceof AppError) {
            throw error;
        }
        
        throw new AppError(
            'Payment processing failed', 
            StatusCodes.INTERNAL_SERVER_ERROR,
            error.message
        );
    }
}

/**
 * Cancel a booking and release seats
 */
async function cancelBooking(data) {
    const transaction = await db.sequelize.transaction();
    try {
        const booking = await bookingRepository.get(data.bookingId, transaction);

        if (!booking) {
            throw new AppError('Booking not found', StatusCodes.NOT_FOUND);
        }

        if (booking.status === CANCELLED) {
            throw new AppError('Booking is already cancelled', StatusCodes.BAD_REQUEST);
        }

        if ([INITIATED, BOOKED].includes(booking.status)) {
            await bookingRepository.update(data.bookingId, { status: CANCELLED }, transaction);

            await axios.patch(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${booking.flightId}/seats/add`, {
                seats: booking.noOfSeats
            });

            await transaction.commit();
            return { 
                success: true,
                message: 'Booking cancelled successfully',
                bookingId: data.bookingId
            };
        }

        throw new AppError('Cannot cancel booking in current state', StatusCodes.BAD_REQUEST);

    } catch (error) {
        await transaction.rollback();
        
        if (error instanceof AppError) {
            throw error;
        }
        
        throw new AppError(
            'Failed to cancel booking', 
            StatusCodes.INTERNAL_SERVER_ERROR,
            error.message
        );
    }
}

/**
 * Cancel all old bookings that are still in INITIATED state after 5 minutes
 * (called automatically by cron job)
 */
async function cancelOldBookings() {
    const transaction = await db.sequelize.transaction();
    try {
        const cutoffTime = new Date(Date.now() - 5 * 60 * 1000);

        const oldBookings = await bookingRepository.getOldBookings(INITIATED, cutoffTime, transaction);

        if (oldBookings.length === 0) {
            await transaction.commit();
            return { 
                success: true,
                message: 'No old bookings to cancel' 
            };
        }

        const results = [];

        for (const booking of oldBookings) {
            try {
                await bookingRepository.update(booking.id, { status: CANCELLED }, transaction);

                await axios.patch(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${booking.flightId}/seats/add`, {
                    seats: booking.noOfSeats
                });

                results.push({
                    bookingId: booking.id,
                    status: 'cancelled',
                    message: 'Successfully cancelled expired booking'
                });

            } catch (err) {
                results.push({
                    bookingId: booking.id,
                    status: 'failed',
                    error: err.message
                });
                console.error(`Failed to cancel booking ${booking.id}:`, err.message);
            }
        }

        await transaction.commit();
        return {
            success: true,
            message: `Processed ${oldBookings.length} old bookings`,
            successCount: results.filter(r => r.status === 'cancelled').length,
            failedCount: results.filter(r => r.status === 'failed').length,
            results
        };

    } catch (error) {
        await transaction.rollback();
        console.error('Error in cancelOldBookings:', error);
        throw new AppError('Failed to cancel old bookings', StatusCodes.INTERNAL_SERVER_ERROR);
    }
}

/**
 * Get idempotency store stats (for monitoring/debugging)
 */
function getIdempotencyStats() {
    return {
        totalKeys: idempotencyStore.size,
        keys: Array.from(idempotencyStore.keys())
    };
}

/**
 * Clear idempotency store (for testing purposes)
 */
function clearIdempotencyStore() {
    idempotencyStore.clear();
}

module.exports = {
    createBooking,
    makePayment,
    cancelBooking,
    cancelOldBookings,
    getIdempotencyStats,
    clearIdempotencyStore
};