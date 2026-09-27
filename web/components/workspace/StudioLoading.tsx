import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { hasStudioStarted } from '@/lib/rendering/startup';
import markup from './loading.html?raw';

// The same local template is injected into index.html before JavaScript loads.
export default function StudioLoading() {
  const { t } = useTranslation();
  const loading = !hasStudioStarted();
  useEffect(() => {
    if (!loading) return;
    const main = document.querySelector('main');
    if (!main) return;
    const wasInert = main.inert;
    main.inert = true;
    return () => {
      main.inert = wasInert;
    };
  }, [loading]);
  if (!loading) return null;
  return createPortal(
    <div
      dangerouslySetInnerHTML={{
        __html: markup.replace('__STUDIO_LOADING_LABEL__', t('app.loading')),
      }}
    />,
    document.body,
  );
}
