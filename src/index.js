const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const apiRoutes = require('./routes');

app.use(express.json());
app.use('/api', apiRoutes);

app.listen(PORT, () => {
  console.log(` Successfully started the server on PORT: ${PORT}`);
});
