export function signInReturnTo(value: unknown) {
  const origin = 'https://shopping.invalid';
  if (typeof value !== 'string' || !URL.canParse(value, origin)) return '/';

  const target = new URL(value, origin);
  return target.origin === origin &&
    !target.pathname.startsWith('//') &&
    !/^\/(?:signin|signup)(?:\/|$)/.test(target.pathname)
    ? target.pathname + target.search
    : '/';
}
