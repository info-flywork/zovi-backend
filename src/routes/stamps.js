"use strict";

const express = require("express");
const {
  StampRepository,
  normalizeLocale,
} = require("../services/StampRepository");
const {
  stampsCatalogCache,
  stampsCatalogKey,
} = require("../cache/appCache");

const router = express.Router();
const stamps = new StampRepository();

/**
 * GET /stamps?locale=tr
 * Public catalog endpoint.
 */
router.get("/", async (req, res, next) => {
  try {
    const locale = normalizeLocale(req.query.locale);
    const data = await stampsCatalogCache.getOrSet(
      stampsCatalogKey(locale),
      async () => {
        const rows = await stamps.list({ locale, includeInactive: false });
        return {
          locale,
          stamps: rows.map((stamp) => stamp.toJSON()),
        };
      },
    );
    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
