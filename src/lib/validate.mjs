// Sanity rules from the spec: no negative fee, fee under the network's cap, price under 1 hour old, fee within 10x of the
// 7-day median (else: anomaly flag, keep the previous good value, alert).
export function validate(net, asset, snap, price, history, cfg) {
  const flags = [];
  if (!(snap.fee_native >= 0)) flags.push('negative_or_missing_fee');
  if (Date.now() - Date.parse(price.observed_at) > cfg.price_max_age_s * 1000) flags.push('price_stale');
  if (snap.fee_usd > net.sanity_cap_usd) flags.push(`fee_above_cap_${net.sanity_cap_usd}`);
  const rows = history.filter((r) => r.asset === asset.id && r.network === net.id && Date.now() - Date.parse(r.ts) < 7 * 86400e3 && !r.flags).map((r) => +r.fee_usd).sort((a, b) => a - b);
  if (rows.length >= cfg.anomaly_min_history_rows) {
    const med = rows[Math.floor(rows.length / 2)];
    if (med > 0 && snap.fee_usd > med * cfg.anomaly_multiple) flags.push(`anomaly_${(snap.fee_usd / med).toFixed(1)}x_7d_median`);
    snap.median_7d_usd = med;
  }
  return flags;
}
