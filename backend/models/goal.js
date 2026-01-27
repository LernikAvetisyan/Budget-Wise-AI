// backend/models/goal.js
// Purpose: Goal CRUD, scoped to the authenticated user via goal_section ownership

const pool = require("../config/db");

module.exports = {
  async findBySectionForUser(username, sectionId) {
    const [rows] = await pool.query(
      `
      SELECT
        g.id,
        g.section_id          AS sectionId,
        g.name,
        g.price_amount        AS priceAmount,
        g.price_tax_included  AS priceTaxIncluded,
        g.price_tax_rate      AS priceTaxRate,
        g.priority,
        g.min_monthly_deposit AS minMonthlyDeposit,
        g.deposit_date        AS depositDate,
        g.deposit_time        AS depositTime,
        g.deposit_paused      AS depositPaused,
        g.status,
        g.start_date          AS startDate,
        g.end_date            AS endDate,
        g.actual_price        AS actualPrice,
        g.createdAt,
        g.updatedAt,
        COALESCE(SUM(CASE WHEN d.status = 'applied' THEN d.amount ELSE 0 END), 0) AS totalDeposited
      FROM goal g
      INNER JOIN goal_section s
        ON s.id = g.section_id
       AND s.username = ?
      LEFT JOIN goal_deposit d
        ON d.goal_id = g.id
      WHERE g.section_id = ?
      GROUP BY g.id
      ORDER BY g.createdAt ASC
      `,
      [username, sectionId]
    );
    return rows;
  },

  async findByIdForUser(username, id) {
    const [rows] = await pool.query(
      `
      SELECT
        g.id,
        g.section_id          AS sectionId,
        g.name,
        g.price_amount        AS priceAmount,
        g.price_tax_included  AS priceTaxIncluded,
        g.price_tax_rate      AS priceTaxRate,
        g.priority,
        g.min_monthly_deposit AS minMonthlyDeposit,
        g.deposit_date        AS depositDate,
        g.deposit_time        AS depositTime,
        g.deposit_paused      AS depositPaused,
        g.status,
        g.start_date          AS startDate,
        g.end_date            AS endDate,
        g.actual_price        AS actualPrice,
        g.createdAt,
        g.updatedAt
      FROM goal g
      INNER JOIN goal_section s
        ON s.id = g.section_id
       AND s.username = ?
      WHERE g.id = ?
      `,
      [username, id]
    );
    return rows[0] || null;
  },

  async create(username, sectionId, data) {
    const [secRows] = await pool.query(
      "SELECT id FROM goal_section WHERE id = ? AND username = ?",
      [sectionId, username]
    );
    if (!secRows.length) return null;

    const {
      name,
      priceAmount,
      priceTaxIncluded = 0,
      priceTaxRate = null,
      priority = 3,
      minMonthlyDeposit = null,
      depositDate = null,
      depositTime = null,
      depositPaused = 0,
      status = "active",
      startDate = null,
      endDate = null,
      actualPrice = null
    } = data;

    await pool.query(
      `
      INSERT INTO goal
        (section_id, name, price_amount, price_tax_included, price_tax_rate,
         priority, min_monthly_deposit, deposit_date, deposit_time, deposit_paused,
         status, start_date, end_date, actual_price)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        sectionId,
        name,
        priceAmount,
        priceTaxIncluded ? 1 : 0,
        priceTaxRate,
        priority,
        minMonthlyDeposit,
        depositDate,
        depositTime,
        depositPaused ? 1 : 0,
        status,
        startDate,
        endDate,
        actualPrice
      ]
    );

    const [rows] = await pool.query(
      `
      SELECT
        g.id,
        g.section_id          AS sectionId,
        g.name,
        g.price_amount        AS priceAmount,
        g.price_tax_included  AS priceTaxIncluded,
        g.price_tax_rate      AS priceTaxRate,
        g.priority,
        g.min_monthly_deposit AS minMonthlyDeposit,
        g.deposit_date        AS depositDate,
        g.deposit_time        AS depositTime,
        g.deposit_paused      AS depositPaused,
        g.status,
        g.start_date          AS startDate,
        g.end_date            AS endDate,
        g.actual_price        AS actualPrice,
        g.createdAt,
        g.updatedAt
      FROM goal g
      INNER JOIN goal_section s
        ON s.id = g.section_id
       AND s.username = ?
      WHERE g.section_id = ?
      ORDER BY g.id DESC
      LIMIT 1
      `,
      [username, sectionId]
    );
    return rows[0] || null;
  },

  async update(username, id, data) {
    const fields = [];
    const fieldValues = [];

    const map = {
      sectionId: "section_id",
      name: "name",
      priceAmount: "price_amount",
      priceTaxIncluded: "price_tax_included",
      priceTaxRate: "price_tax_rate",
      priority: "priority",
      minMonthlyDeposit: "min_monthly_deposit",
      depositDate: "deposit_date",
      depositTime: "deposit_time",
      depositPaused: "deposit_paused",
      status: "status",
      startDate: "start_date",
      endDate: "end_date",
      actualPrice: "actual_price"
    };

    if (data.sectionId !== undefined && data.sectionId !== null) {
      const [secRows] = await pool.query(
        "SELECT id FROM goal_section WHERE id = ? AND username = ?",
        [data.sectionId, username]
      );
      if (!secRows.length) return null;
    }

    Object.keys(map).forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`g.${map[key]} = ?`);
        if (key === "priceTaxIncluded" || key === "depositPaused") {
          fieldValues.push(data[key] ? 1 : 0);
        } else {
          fieldValues.push(data[key]);
        }
      }
    });

    if (!fields.length) return null;

    const values = [username, ...fieldValues, id];

    await pool.query(
      `
      UPDATE goal g
      INNER JOIN goal_section s
        ON s.id = g.section_id
       AND s.username = ?
      SET ${fields.join(", ")}
      WHERE g.id = ?
      `,
      values
    );

    const [rows] = await pool.query(
      `
      SELECT
        g.id,
        g.section_id          AS sectionId,
        g.name,
        g.price_amount        AS priceAmount,
        g.price_tax_included  AS priceTaxIncluded,
        g.price_tax_rate      AS priceTaxRate,
        g.priority,
        g.min_monthly_deposit AS minMonthlyDeposit,
        g.deposit_date        AS depositDate,
        g.deposit_time        AS depositTime,
        g.deposit_paused      AS depositPaused,
        g.status,
        g.start_date          AS startDate,
        g.end_date            AS endDate,
        g.actual_price        AS actualPrice,
        g.createdAt,
        g.updatedAt
      FROM goal g
      INNER JOIN goal_section s
        ON s.id = g.section_id
       AND s.username = ?
      WHERE g.id = ?
      `,
      [username, id]
    );

    return rows[0] || null;
  },

  async remove(username, id) {
    const [res] = await pool.query(
      `
      DELETE g
      FROM goal g
      INNER JOIN goal_section s
        ON s.id = g.section_id
       AND s.username = ?
      WHERE g.id = ?
      `,
      [username, id]
    );
    return res.affectedRows > 0;
  }
};
