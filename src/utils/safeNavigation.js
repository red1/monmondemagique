export function safeGoBack(router, fallback = '/') {
  if (router.canGoBack?.()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
