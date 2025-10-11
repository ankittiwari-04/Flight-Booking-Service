const { StatusCodes } = require('http-status-codes');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    this.name = 'AppError';
  }
}

module.exports = AppError;