'use strict';
const { Model } = require('sequelize');
const { BOOKING_STATUS } = require('../utils/common');
const { BOOKED, CANCELLED, INITIATED, PENDING } = BOOKING_STATUS;

module.exports = (sequelize, DataTypes) => {
  class Booking extends Model {
    static associate(models) {}
  }

  Booking.init({
    flightId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM,
      values: [BOOKED, CANCELLED, INITIATED, PENDING],
      allowNull: false,
      defaultValue: INITIATED
    },
    noOfSeats: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    totalCost: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Booking',
  });

  return Booking;
};
