// A control's own copy of a stored value: what the rider types or taps shows at once, and the copy follows the stored value when
// that value changes. Not when the control first appears: an effect that set it then too ran only after the first paint, and put
// the value read back over anything typed before it. The field then looked untouched when it was left, so no change fired and the
// typing was never saved (YOU-EXPORT-UI's failure in CI: the weight typed, emptied, not kept).
import { useEffect, useRef, useState } from 'preact/hooks';

export function useFollowing<T>(value: T): [T, (next: T) => void] {
  const [own, setOwn] = useState(value);
  const seen = useRef(value);
  useEffect(() => {
    if (Object.is(seen.current, value)) return;
    seen.current = value;
    setOwn(value);
  }, [value]);
  return [own, setOwn];
}
