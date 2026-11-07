// The weather refresh mode (spec section 6.6, Decision 3). One line in build.config.json decides; anything but "auto" is tap only.
// Only the one field: the whole file would put the launch switch into the app's bytes (review of PR 63, C1, APP-LAUNCH-BYTES).
import { weatherMode } from '../../build.config.json';

export type WeatherMode = 'tap' | 'auto';

export const WEATHER_MODE: WeatherMode = (weatherMode as unknown) === 'auto' ? 'auto' : 'tap';
