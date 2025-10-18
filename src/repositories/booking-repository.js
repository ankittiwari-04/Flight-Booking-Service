const { StatusCodes } = require('http-status-codes');
const db = require('../models');
const { Booking } = db;
const AppError = require('../utils/errors/app-error');
const CrudRepository = require('./crud-repository');
const { Enums } = require('../utils/common');
const { CANCELLED, BOOKED } = Enums.BOOKING_STATUS;

class BookingRepository extends CrudRepository {
    constructor() {
        super(Booking);
    }

    async createBooking(data, transaction) {
        try {
            const booking = await Booking.create(data, { transaction });
            return booking;
        } catch (error) {
            if (error.name === 'SequelizeValidationError') {
                const explanation = error.errors.map((err) => err.message);
                throw new AppError(explanation, StatusCodes.BAD_REQUEST);
            }
            throw new AppError('Cannot create a new booking', StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async getBookingById(id, transaction = null) {
        try {
            const booking = await Booking.findByPk(id, { transaction });
            return booking;
        } catch (error) {
            throw new AppError('Error while fetching booking', StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async updateBooking(id, data, transaction = null) {
        try {
            const booking = await Booking.update(data, {
                where: { id },
                transaction
            });
            return booking;
        } catch (error) {
            if (error.name === 'SequelizeValidationError') {
                const explanation = error.errors.map((err) => err.message);
                throw new AppError(explanation, StatusCodes.BAD_REQUEST);
            }
            throw new AppError('Cannot update the booking', StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async cancelBooking(id, transaction = null) {
        try {
            const booking = await Booking.update(
                { status: CANCELLED },
                {
                    where: { id },
                    transaction
                }
            );
            return booking;
        } catch (error) {
            throw new AppError('Cannot cancel the booking', StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async getBookingsByUser(userId, transaction = null) {
        try {
            const bookings = await Booking.findAll({
                where: { userId },
                transaction
            });
            return bookings;
        } catch (error) {
            throw new AppError('Error while fetching user bookings', StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async getBookingsByFlight(flightId, transaction = null) {
        try {
            const bookings = await Booking.findAll({
                where: { flightId },
                transaction
            });
            return bookings;
        } catch (error) {
            throw new AppError('Error while fetching flight bookings', StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async getBookingsByStatus(status, transaction = null) {
        try {
            const bookings = await Booking.findAll({
                where: { status },
                transaction
            });
            return bookings;
        } catch (error) {
            throw new AppError('Error while fetching bookings by status', StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async getOldBookings(status, cutoffTime, transaction = null) {
        try {
            const response = await Booking.findAll({
                where: {
                    status,
                    createdAt: {
                        [db.Sequelize.Op.lt]: cutoffTime
                    }
                },
                transaction
            });
            return response;
        } catch (error) {
            console.log('Error in getOldBookings:', error);
            throw new AppError('Error while fetching old bookings', StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async getBookingWithUserAndFlight(id, transaction = null) {
        try {
            const booking = await Booking.findByPk(id, {
                include: [
                    {
                        model: db.User,
                        attributes: ['id', 'email', 'name']
                    },
                    {
                        model: db.Flight,
                        attributes: [
                            'id',
                            'flightNumber',
                            'airplaneId',
                            'departureAirportId',
                            'arrivalAirportId',
                            'departureTime',
                            'arrivalTime',
                            'price'
                        ]
                    }
                ],
                transaction
            });
            return booking;
        } catch (error) {
            throw new AppError('Error while fetching booking details', StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }
}

module.exports = BookingRepository;
