// backend/controllers/cardsController.js
const Cards = require('../models/cardsModel');

function humanizeAgo(date) {
  if (!date) return '—';
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 0) return 'just now';

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 7) {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }
  if (diffDay >= 1) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  if (diffHour >= 1) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  if (diffMin >= 1) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  return 'just now';
}

exports.getCards = async (req, res) => {
  try {
    const username = req.user.username;
    const raw = await Cards.getCardSummaries(username);

    const cards = raw.map(r => {
      const isCredit = r.accountType === 'credit';
      const balance = Number(r.currentBalance) || 0;
      const monthlySpend = Number(r.monthlySpend) || 0;
      const lastTx = humanizeAgo(r.lastTxAt);

      let statusText = 'All Good';
      let statusLevel = 'good';

      if (isCredit) {
        if (monthlySpend >= 100000) {
          statusText = 'High Spend';
          statusLevel = 'bad';
        } else if (monthlySpend >= 50000) {
          statusText = 'Watch Spending';
          statusLevel = 'warn';
        }
      } else {
        if (balance < 600) {
          statusText = 'Low Balance';
          statusLevel = 'bad';
        } else if (balance < 5000) {
          statusText = 'Doing Okay';
          statusLevel = 'warn';
        }
      }

      return {
        accountType: r.accountType,
        last4: r.last4,
        balance,
        monthlySpend,
        lastTx,
        statusText,
        statusLevel
      };
    });

    res.json({ cards });
  } catch (err) {
    console.error('getCards error:', err);
    res.status(500).json({ error: 'Failed to load card summary' });
  }
};
