const express = require('express');
const { info } = require('../../controllers/info-controller');
const bookingRoutes = require('./booking'); // Add this import

const router = express.Router();

router.get('/info', info);
router.use('/bookings', bookingRoutes); // Add this line

module.exports = router;