import { describe, it, expect } from 'vitest';
import {
  tryTransition,
  shouldAutoPause,
  shouldAutoEnd,
  VALID_TRANSITIONS,
  TRANSITION_PERMISSIONS,
} from '../state-machine.js';

// ---------------------------------------------------------------------------
// VALID_TRANSITIONS shape
// ---------------------------------------------------------------------------

describe('VALID_TRANSITIONS', () => {
  it('waiting can only go to active', () => {
    expect(VALID_TRANSITIONS.waiting).toEqual(['active']);
  });

  it('active can go to paused or ended', () => {
    expect(VALID_TRANSITIONS.active).toContain('paused');
    expect(VALID_TRANSITIONS.active).toContain('ended');
    expect(VALID_TRANSITIONS.active).toHaveLength(2);
  });

  it('paused can go to active or ended', () => {
    expect(VALID_TRANSITIONS.paused).toContain('active');
    expect(VALID_TRANSITIONS.paused).toContain('ended');
    expect(VALID_TRANSITIONS.paused).toHaveLength(2);
  });

  it('ended has no valid transitions (terminal)', () => {
    expect(VALID_TRANSITIONS.ended).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TRANSITION_PERMISSIONS shape
// ---------------------------------------------------------------------------

describe('TRANSITION_PERMISSIONS', () => {
  it('only provider may start a session (waiting→active)', () => {
    expect(TRANSITION_PERMISSIONS['waiting:active']).toEqual(['provider']);
  });

  it('only provider may pause (active→paused)', () => {
    expect(TRANSITION_PERMISSIONS['active:paused']).toEqual(['provider']);
  });

  it('both roles may end from active (active→ended)', () => {
    expect(TRANSITION_PERMISSIONS['active:ended']).toContain('provider');
    expect(TRANSITION_PERMISSIONS['active:ended']).toContain('patient');
  });

  it('only provider may resume from paused (paused→active)', () => {
    expect(TRANSITION_PERMISSIONS['paused:active']).toEqual(['provider']);
  });

  it('only provider may end from paused (paused→ended)', () => {
    expect(TRANSITION_PERMISSIONS['paused:ended']).toEqual(['provider']);
  });
});

// ---------------------------------------------------------------------------
// tryTransition — waiting → active
// ---------------------------------------------------------------------------

describe('tryTransition: waiting → active', () => {
  it('succeeds for provider', () => {
    const result = tryTransition('waiting', 'active', 'provider');
    expect(result.success).toBe(true);
  });

  it('fails for patient', () => {
    const result = tryTransition('waiting', 'active', 'patient');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toMatch(/patient/i);
    }
  });
});

// ---------------------------------------------------------------------------
// tryTransition — active → paused
// ---------------------------------------------------------------------------

describe('tryTransition: active → paused', () => {
  it('succeeds for provider', () => {
    const result = tryTransition('active', 'paused', 'provider');
    expect(result.success).toBe(true);
  });

  it('fails for patient', () => {
    const result = tryTransition('active', 'paused', 'patient');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toMatch(/patient/i);
    }
  });
});

// ---------------------------------------------------------------------------
// tryTransition — active → ended
// ---------------------------------------------------------------------------

describe('tryTransition: active → ended', () => {
  it('succeeds for provider', () => {
    const result = tryTransition('active', 'ended', 'provider');
    expect(result.success).toBe(true);
  });

  it('succeeds for patient', () => {
    const result = tryTransition('active', 'ended', 'patient');
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tryTransition — paused → active
// ---------------------------------------------------------------------------

describe('tryTransition: paused → active', () => {
  it('succeeds for provider', () => {
    const result = tryTransition('paused', 'active', 'provider');
    expect(result.success).toBe(true);
  });

  it('fails for patient', () => {
    const result = tryTransition('paused', 'active', 'patient');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tryTransition — paused → ended
// ---------------------------------------------------------------------------

describe('tryTransition: paused → ended', () => {
  it('succeeds for provider', () => {
    const result = tryTransition('paused', 'ended', 'provider');
    expect(result.success).toBe(true);
  });

  it('fails for patient', () => {
    const result = tryTransition('paused', 'ended', 'patient');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tryTransition — ended (terminal state)
// ---------------------------------------------------------------------------

describe('tryTransition: ended → anything (terminal)', () => {
  const targets = ['waiting', 'active', 'paused', 'ended'] as const;

  for (const target of targets) {
    it(`rejects ended → ${target} for provider`, () => {
      const result = tryTransition('ended', target as any, 'provider');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toMatch(/terminal|ended/i);
      }
    });

    it(`rejects ended → ${target} for patient`, () => {
      const result = tryTransition('ended', target as any, 'patient');
      expect(result.success).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// tryTransition — invalid transitions
// ---------------------------------------------------------------------------

describe('tryTransition: invalid transitions', () => {
  it('rejects waiting → paused for provider', () => {
    const result = tryTransition('waiting', 'paused', 'provider');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toMatch(/not valid/i);
    }
  });

  it('rejects waiting → ended for provider', () => {
    const result = tryTransition('waiting', 'ended', 'provider');
    expect(result.success).toBe(false);
  });

  it('rejects active → waiting for provider', () => {
    const result = tryTransition('active', 'waiting', 'provider');
    expect(result.success).toBe(false);
  });

  it('rejects paused → waiting for provider', () => {
    const result = tryTransition('paused', 'waiting', 'provider');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldAutoPause
// ---------------------------------------------------------------------------

describe('shouldAutoPause', () => {
  it('returns true when active and 0 connected', () => {
    expect(shouldAutoPause('active', 0)).toBe(true);
  });

  it('returns false when active and 1+ connected', () => {
    expect(shouldAutoPause('active', 1)).toBe(false);
    expect(shouldAutoPause('active', 2)).toBe(false);
  });

  it('returns false when waiting and 0 connected', () => {
    expect(shouldAutoPause('waiting', 0)).toBe(false);
  });

  it('returns false when paused and 0 connected', () => {
    expect(shouldAutoPause('paused', 0)).toBe(false);
  });

  it('returns false when ended and 0 connected', () => {
    expect(shouldAutoPause('ended', 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldAutoEnd
// ---------------------------------------------------------------------------

describe('shouldAutoEnd', () => {
  const FIVE_MIN = 5 * 60 * 1000;

  it('returns true when paused, 0 connected, and duration >= 5 min (default)', () => {
    expect(shouldAutoEnd('paused', 0, FIVE_MIN)).toBe(true);
    expect(shouldAutoEnd('paused', 0, FIVE_MIN + 1)).toBe(true);
  });

  it('returns false when paused, 0 connected, but duration < 5 min', () => {
    expect(shouldAutoEnd('paused', 0, FIVE_MIN - 1)).toBe(false);
    expect(shouldAutoEnd('paused', 0, 0)).toBe(false);
  });

  it('returns false when paused but clients are still connected', () => {
    expect(shouldAutoEnd('paused', 1, FIVE_MIN)).toBe(false);
    expect(shouldAutoEnd('paused', 2, FIVE_MIN * 10)).toBe(false);
  });

  it('returns false when active even with long duration and 0 connected', () => {
    expect(shouldAutoEnd('active', 0, FIVE_MIN * 10)).toBe(false);
  });

  it('returns false when ended', () => {
    expect(shouldAutoEnd('ended', 0, FIVE_MIN * 10)).toBe(false);
  });

  it('respects a custom maxPauseDurationMs', () => {
    const tenMin = 10 * 60 * 1000;
    expect(shouldAutoEnd('paused', 0, FIVE_MIN, tenMin)).toBe(false);
    expect(shouldAutoEnd('paused', 0, tenMin, tenMin)).toBe(true);
    expect(shouldAutoEnd('paused', 0, tenMin + 1, tenMin)).toBe(true);
  });
});
