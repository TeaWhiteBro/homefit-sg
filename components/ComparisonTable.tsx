"use client";

import { formatSgd } from "@/lib/format";
import type { AreaEvaluation, Preferences } from "@/lib/types";

interface ComparisonTableProps {
  selected: AreaEvaluation[];
  preferences: Preferences;
  onClear: () => void;
}

export default function ComparisonTable({ selected, preferences, onClear }: ComparisonTableProps) {
  if (selected.length < 2) {
    return (
      <div className="comparison-placeholder">
        <p>Select at least two areas to compare side by side, up to three.</p>
      </div>
    );
  }

  return (
    <div className="comparison-wrap">
      <div className="comparison-head">
        <p className="section-note">
          All figures are for a common room in S$ per month; commute is the one-way estimate to {preferences.destination}.
        </p>
        <button className="text-button" type="button" onClick={onClear}>
          Clear selection
        </button>
      </div>

      <div className="table-scroll">
        <table className="comparison-table">
          <caption className="sr-only">Demo-estimate comparison of the selected areas</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              {selected.map(({ area }) => (
                <th scope="col" key={area.area_id}>
                  {area.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Monthly rent</th>
              {selected.map(({ area }) => (
                <td key={area.area_id}>
                  <strong>{formatSgd(area.monthly_rent_sgd)}</strong>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">One-way commute</th>
              {selected.map(({ area }) => (
                <td key={area.area_id}>
                  about {area.commute_minutes} min
                  <span className="cell-sub">
                    {area.commute_range_minutes[0]}–{area.commute_range_minutes[1]} min
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Budget left</th>
              {selected.map(({ area }) => (
                <td key={area.area_id}>
                  {formatSgd(preferences.monthlyBudgetSgd - area.monthly_rent_sgd)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Under commute limit by</th>
              {selected.map(({ area }) => (
                <td key={area.area_id}>
                  {preferences.maxCommuteMinutes - area.commute_minutes} min
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Quiet (1–5)</th>
              {selected.map(({ area }) => (
                <td key={area.area_id}>{area.quiet_score}/5</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Amenities (1–5)</th>
              {selected.map(({ area }) => (
                <td key={area.area_id}>{area.amenity_score}/5</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Trade-off</th>
              {selected.map(({ area }) => (
                <td key={area.area_id}>{area.tradeoff}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="section-note">All numbers are course demo estimates, not live listings or measured routes. Ratings do not confirm supermarkets, transport or noise levels.</p>
    </div>
  );
}
