const { Booking } = require('../models');
const CrudRepository = require('./crud-repository');

class BookingRepository extends CrudRepository {
    constructor() {
        super(Booking);
    }

    async createBooking(data, transaction) {
        try {
            const booking = await Booking.create(data, { transaction :transaction});
            return booking;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = BookingRepository;
