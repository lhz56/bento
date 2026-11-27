// Publishing a web page lesson: a public link on GitHub Pages, and saving it as a file.
import { t } from '../../i18n.js';

export default function PublishPanel({ codeRef, lesson, projectBundle, publish, setPublish }) {
  return (
    <div className="publish fade-in">
      {publish.ask && (
        <>
          <span>
            🌐{' '}
            {t(
              'This puts your page on the public web, in a repository called bento-pages on your GitHub account. Anyone with the link can see it.',
            )}
          </span>
          <button
            className="btn tiny"
            onClick={async () => {
              setPublish({ busy: true });
              try {
                setPublish(
                  await window.bento.publishWeb(
                    projectBundle(codeRef.current).main,
                    lesson.title || 'my page',
                  ),
                );
              } catch (e) {
                setPublish({
                  err: String(e.message).replace(
                    /^Error invoking remote method '[^']+': (Error: )?/,
                    '',
                  ),
                });
              }
            }}
          >
            {t('Publish it')}
          </button>
          <button className="link" onClick={() => setPublish(null)}>
            {t('Cancel')}
          </button>
        </>
      )}
      {publish.busy && (
        <span>
          <span className="lens-spin" /> {t('Publishing with your GitHub account…')}
        </span>
      )}
      {publish.url && (
        <>
          <span>
            ✓ {t('Published! It can take a minute to appear at')}{' '}
            <button className="link" onClick={() => window.bento?.openExternal?.(publish.url)}>
              {publish.url}
            </button>
          </span>
          <button className="link" onClick={() => setPublish(null)}>
            ✕
          </button>
        </>
      )}
      {publish.err && (
        <>
          <span className="err-msg">{publish.err}</span>
          <button className="link" onClick={() => setPublish(null)}>
            ✕
          </button>
        </>
      )}
    </div>
  );
}
