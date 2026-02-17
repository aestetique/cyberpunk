/**
 * Cyberpunk 2020 Token Ruler - color-coded movement visualization
 *
 * Colors ruler segments based on movement allowances:
 * - Green (#1A804D): within walk distance
 * - Yellow (#B8A46A): requires running (walk < distance ≤ run)
 * - Red (#B60F3C): exceeds run distance
 *
 * Previous movement segments in combat are shown at 50% transparency.
 */
export class CyberpunkTokenRuler extends foundry.canvas.placeables.tokens.TokenRuler {

  /**
   * Override segment styling to apply color coding based on movement distances.
   * @param {TokenRulerWaypoint} waypoint - The destination waypoint for this segment
   * @returns {{alpha?: number, color?: ColorSource, width: number}} Segment style
   * @override
   */
  _getSegmentStyle(waypoint) {
    const style = super._getSegmentStyle(waypoint);

    // Get the token being moved
    const token = this.token;
    if (!token?.actor) return style;

    // Get movement allowances from actor (in meters)
    const actor = token.actor;
    const walkDistance = actor.system.stats?.ma?.total ?? 0;
    const runDistance = actor.system.stats?.ma?.run ?? (walkDistance * 3);

    // Calculate cumulative distance by walking backwards through waypoint chain
    let cumulativeDistance = 0;
    let currentWaypoint = waypoint;

    while (currentWaypoint) {
      cumulativeDistance += currentWaypoint.cost ?? currentWaypoint.measurement?.distance ?? 0;
      currentWaypoint = currentWaypoint.previous;
    }

    // Determine if this is a historical segment (previous movement in combat)
    // Stage "committed" = completed movement, "planned" = current drag
    const isHistorical = waypoint.stage === "committed";
    const baseAlpha = isHistorical ? 0.5 : 1.0;

    // Apply color based on cumulative movement range
    // Custom colors: Green #1A804D, Yellow #B8A46A, Red #B60F3C
    if (cumulativeDistance <= walkDistance) {
      style.color = 0x1A804D;  // Green - within walk range
      style.alpha = baseAlpha;
    } else if (cumulativeDistance <= runDistance) {
      style.color = 0xB8A46A;  // Yellow - requires running
      style.alpha = baseAlpha;
    } else {
      style.color = 0xB60F3C;  // Red - exceeds run distance
      style.alpha = baseAlpha;
    }

    return style;
  }
}
