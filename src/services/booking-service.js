const axios = require('axios');
const { StatusCodes } = require('http-status-codes');
const { BookingRepository } = require('../repositories');
const { ServerConfig } = require('../config');
const db = require('../models');
const AppError = require('../utils/errors/app-error');
const { Enums } = require('../utils/common');
const { BOOKED, CANCELLED, INITIATED } = Enums.BOOKING_STATUS;

const bookingRepository = new BookingRepository();

async function createBooking(data) {
    const transaction = await db.sequelize.transaction();
    try {
        const flight = await axios.get(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${data.flightId}`);
        const flightData = flight.data.data;

        if (data.noOfSeats > flightData.totalSeats) {
            throw new AppError('Not enough seats available', StatusCodes.BAD_REQUEST);
        }

        const totalBillingAmount = data.noOfSeats * flightData.price;
        const bookingPayload = { ...data, totalCost: totalBillingAmount, status: INITIATED };

        const booking = await bookingRepository.create(bookingPayload, transaction);

        await axios.patch(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${data.flightId}/seats`, {
            seats: data.noOfSeats
        });

        await transaction.commit();
        return booking;

    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

async function makePayment(data) {
    const transaction = await db.sequelize.transaction();
    try {
        const bookingDetails = await bookingRepository.get(data.bookingId, transaction);

        if (bookingDetails.status === CANCELLED) {
            throw new AppError('The booking has already been cancelled', StatusCodes.BAD_REQUEST);
        }

        const bookingTime = new Date(bookingDetails.createdAt);
        const currentTime = new Date();

        if (currentTime - bookingTime > 300000) {
            await cancelBooking({ bookingId: data.bookingId });
            throw new AppError('The booking has expired', StatusCodes.BAD_REQUEST);
        }

        if (bookingDetails.totalCost !== data.totalCost) {
            throw new AppError('The amount of the payment doesnt match', StatusCodes.BAD_REQUEST);
        }

        if (bookingDetails.userId !== data.userId) {
            throw new AppError('The user corresponding to the booking doesnt match', StatusCodes.BAD_REQUEST);
        }

        const response = await bookingRepository.update(data.bookingId, { status: BOOKED }, transaction);
        await transaction.commit();
        return response;

    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

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

        if (booking.status === INITIATED || booking.status === BOOKED) {
            await bookingRepository.update(data.bookingId, { status: CANCELLED }, transaction);

            await axios.patch(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${booking.flightId}/seats/add`, {
                seats: booking.noOfSeats
            });

            await transaction.commit();
            return { message: 'Booking cancelled successfully' };
        } else {
            throw new AppError('Cannot cancel booking in current state', StatusCodes.BAD_REQUEST);
        }

    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

async function cancelOldBookings() {
    const transaction = await db.sequelize.transaction();
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        const oldBookings = await bookingRepository.getOldBookings(INITIATED, fiveMinutesAgo, transaction);
        
        if (oldBookings.length === 0) {
            await transaction.commit();
            return { message: 'No old bookings to cancel' };
        }

        const cancellationResults = [];
        
        for (const booking of oldBookings) {
            try {
                await bookingRepository.update(booking.id, { status: CANCELLED }, transaction);
                
                await axios.patch(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${booking.flightId}/seats/add`, {
                    seats: booking.noOfSeats
                });
                
                cancellationResults.push({
                    bookingId: booking.id,
                    status: 'cancelled',
                    message: 'Successfully cancelled expired booking'
                });
                
            } catch (error) {
                cancellationResults.push({
                    bookingId: booking.id,
                    status: 'failed',
                    error: error.message
                });
                console.error(`Failed to cancel booking ${booking.id}:`, error.message);
            }
        }

        await transaction.commit();
        
        return {
            message: `Processed ${oldBookings.length} old bookings`,
            results: cancellationResults,
            successCount: cancellationResults.filter(result => result.status === 'cancelled').length,
            failedCount: cancellationResults.filter(result => result.status === 'failed').length
        };

    } catch (error) {
        await transaction.rollback();
        console.error('Error in cancelOldBookings:', error);
        throw new AppError('Failed to cancel old bookings', StatusCodes.INTERNAL_SERVER_ERROR);
    }
}

module.exports = {
    createBooking,
    makePayment,
    cancelBooking,
    cancelOldBookings
};