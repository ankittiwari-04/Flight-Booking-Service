const axios = require('axios');
const { StatusCodes } = require('http-status-codes');
const { BookingRepository } = require('../repositories');
const { ServerConfig } = require('../../config');
const db = require('../models');
const AppError = require('../utils/errors/app-error');
const { SuccessResponse, ErrorResponse } = require('../utils/common');

async function createBooking(data) {
    const transaction = await db.sequelize.transaction();
    try {
        const flight = await axios.get(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${data.flightId}`);
        const flightData = flight.data.data;

        if (data.noofSeats > flightData.totalSeats) {
            throw new AppError('Not enough seats available', StatusCodes.BAD_REQUEST);
        }

        await transaction.commit();

        return {
            success: true,
            message: "Successfully completed the request",
            data: {},
            error: {}
        };

    } catch (error) {
        await transaction.rollback();
        console.error("Error in createBooking:", error);

        return {
            success: false,
            message: error.message || "Something went wrong",
            data: {},
            error: {}
        };
    }
}

module.exports = {
    createBooking
};
