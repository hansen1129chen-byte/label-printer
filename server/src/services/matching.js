/**
 * Shared matching helpers for GIGL ↔ local order matching.
 * Used by both sync-gigl.js (auto-match) and routes/gigl.js (match-suggestions).
 */

/**
 * Extract last N digits from a phone number, stripping all non-digits.
 */
function lastDigits(phone, n = 4) {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-n);
}

/**
 * Normalize a name: lowercase, trim, collapse whitespace.
 */
function normName(name) {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Check if two names are a fuzzy match.
 */
function nameMatches(localName, giglName) {
  const a = normName(localName);
  const b = normName(giglName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  if (a.split(' ')[0] === b.split(' ')[0]) return true;
  return false;
}

/**
 * Score a candidate match between a local order row and a GIGL shipment.
 * Higher score = better match. Used for ranking multiple candidates.
 */
function scoreCandidate(localRow, giglShipment) {
  let score = 0;
  const localName = normName(localRow.customer_name || '');
  const giglName = normName(giglShipment.receiver_name || '');

  // Name quality
  if (giglName === localName) score += 10;
  else if (giglName.includes(localName) || localName.includes(giglName)) score += 7;
  else score += 5;

  // Phone match (assumed already verified by hard filter)
  score += 10;

  // Date proximity
  const giglDate = giglShipment.date_created ? new Date(giglShipment.date_created) : null;
  const localDate = localRow.order_created_at ? new Date(localRow.order_created_at) : null;
  if (giglDate && localDate) {
    const diffDays = Math.abs((giglDate - localDate) / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) score += 10;
    else if (diffDays <= 2) score += 7;
    else if (diffDays <= 3) score += 4;
    else if (diffDays <= 7) score += 1;
  }

  // Amount proximity
  const giglAmt = Number(giglShipment.grand_total || 0);
  const localAmt = Number(localRow.actual_amount || localRow.total_amount || 0);
  if (giglAmt > 0 && localAmt > 0) {
    const ratio = Math.max(giglAmt, localAmt) / Math.min(giglAmt, localAmt);
    if (ratio <= 1.1) score += 5;
    else if (ratio <= 1.3) score += 3;
    else if (ratio <= 1.5) score += 1;
  }

  return score;
}

/**
 * Check if GIGL tracking data indicates delivery.
 */
function isDelivered(trackData) {
  if (!trackData) return false;
  const desc = (trackData.currentScanStatusDescription || '').toUpperCase();
  if (desc.includes('DELIVERED') || desc.includes('DLV')) return true;
  const history = trackData.fullTrackHistory || [];
  return history.some(h => {
    const s = (h.status || '').toUpperCase();
    const d = (h.scanStatusIncident || '').toUpperCase();
    return s === 'DLV' || d.includes('DELIVERED');
  });
}

/**
 * Check if GIGL tracking data indicates cancellation.
 */
function isCancelled(trackData) {
  if (!trackData) return false;
  const history = trackData.fullTrackHistory || [];
  return history.some(h => {
    const s = (h.status || '').toUpperCase();
    const d = (h.scanStatusIncident || '').toUpperCase();
    return s === 'SSC' || d.includes('CANCELLED');
  });
}

module.exports = { lastDigits, normName, nameMatches, scoreCandidate, isDelivered, isCancelled };
