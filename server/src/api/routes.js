const express = require('express');
const submissionsRouter = require('./submissions');
const cardsRouter = require('./cards');

const router = express.Router();

router.use('/submissions', submissionsRouter);
router.use('/submissions', cardsRouter);

module.exports = router;
