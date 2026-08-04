"use strict";

const express = require("express");
const {
  StampRepository,
  normalizeLocale,
} = require("../services/StampRepository");

const router = express.Router();
const stamps = new StampRepository();

/**
 * GET /stamps?locale=tr
 * Public catalog endpoint.
 */
router.get("/", async (req, res, next) => {
  try {
    const locale = normalizeLocale(req.query.locale);
    const data = await stamps.list({ locale, includeInactive: false });
    return res.json({
      success: true,
      data: {
        locale,
        stamps: data.map((stamp) => stamp.toJSON()),
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
