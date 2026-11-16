import type { UICtx } from '../context';
import type { Nav } from '../nav';
import { CityScreen } from './City';
import { DialogScreen } from './Dialog';
import { HubScreen } from './Hub';
import { PauseScreen } from './Pause';
import { ResultsScreen } from './Results';
import { RiderScreen } from './Rider';
import { SettingsScreen } from './Settings';
import { ShopScreen } from './Shop';
import { SplashScreen } from './Splash';
import { SpotScreen } from './Spot';
import { TricksScreen } from './Tricks';

/** Screens are created lazily on first use. */
export function registerScreens(nav: Nav, ctx: UICtx): void {
  nav.register('splash', () => new SplashScreen(ctx));
  nav.register('hub', () => new HubScreen(ctx));
  nav.register('city', () => new CityScreen(ctx));
  nav.register('spot', () => new SpotScreen(ctx));
  nav.register('results', () => new ResultsScreen(ctx));
  nav.register('pause', () => new PauseScreen(ctx));
  nav.register('settings', () => new SettingsScreen(ctx));
  nav.register('tricks', () => new TricksScreen(ctx));
  nav.register('shop', () => new ShopScreen(ctx));
  nav.register('rider', () => new RiderScreen(ctx));
  nav.register('dialog', () => new DialogScreen(ctx));
}
