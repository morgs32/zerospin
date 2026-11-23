import '../../../packages/system-worker/env-types';
import '../../../packages/system-worker/worker-configuration';

declare global {
  namespace Cloudflare {
    interface Env {
      CLERK_JWT_KEY?: string;
      CLERK_AUTHORIZED_PARTIES?: string;
      SHOPPING_ZEROSPIN_API_URL?: string;
      ZEROSPIN_SECRET_KEY?: string;
      ZEROSPIN_ENVIRONMENT: 'dev' | 'production';
    }
  }
}
