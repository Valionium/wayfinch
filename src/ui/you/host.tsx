// The services You runs on, made once; the one thing app.tsx loads for You.
import { browserYouServices } from './services.ts';
import { YouScreen } from './you.tsx';

const services = browserYouServices();

export function YouHost() {
  return <YouScreen services={services} />;
}
