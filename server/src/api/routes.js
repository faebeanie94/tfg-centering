const express = require('express');
const submissionsRouter = require('./submissions');
const cardsRouter = require('./cards');
const exportRouter = require('./export');

const router = express.Router();

router.use('/submissions', submissionsRouter);
router.use('/submissions', cardsRouter);
router.use('/submissions', exportRouter);

module.exports = router;
