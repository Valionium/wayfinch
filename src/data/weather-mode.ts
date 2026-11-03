// The weather refresh mode (spec section 6.6, Decision 3). One line in build.config.json decides; anything but "auto" is tap only.
import config from '../../build.config.json';

export type WeatherMode = 'tap' | 'auto';

export const WEATHER_MODE: WeatherMode = (config as { weatherMode?: unknown }).weatherMode === 'auto' ? 'auto' : 'tap';
