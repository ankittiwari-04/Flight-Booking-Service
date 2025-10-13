const express = require('express');
const { StatusCodes } = require('http-status-codes');

const router = express.Router(); // ← Add this missing line

// POST /api/v1/bookings
router.post('/', (req, res) => {
    try {
        // Add safety check for req.body
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: 'Request body is empty or missing',
                data: {},
                error: {}
            });
        }

        const { flightId, passengerName, seatNumber, email } = req.body;
        
        // Validate required fields
        if (!flightId || !passengerName || !email) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: 'flightId, passengerName, and email are required',
                data: {},
                error: {}
            });
        }

        // Create booking
        const booking = {
            id: Date.now(),
            flightId,
            passengerName,
            email,
            seatNumber: seatNumber || null,
            status: 'confirmed',
            createdAt: new Date()
        };

        return res.status(StatusCodes.CREATED).json({
            success: true,
            message: 'Booking created successfully',
            data: booking,
            error: {}
        });
    } catch (error) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to create booking',
            data: {},
            error: error.message
        });
    }
});

// GET /api/v1/bookings
router.get('/', (req, res) => {
    return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Bookings retrieved successfully',
        data: [],
        error: {}
    });
});
router.get('/:id', (req, res) => {
    const { id } = req.params;
    
    return res.status(StatusCodes.OK).json({
        success: true,
        message: `Booking ${id} retrieved successfully`,
        data: { id },
        error: {}
    });
});

module.exports = router;