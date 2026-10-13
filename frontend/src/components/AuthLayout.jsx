import MemorialLogo from './MemorialLogo';

const AuthLayout = ({
  pageTitle,
  pageSubtitle,
  description,
  promptTitle,
  promptDescription,
  children,
}) => (
  <main className="auth-page">
    <section className="auth-shell">
      <div className="auth-panel">
        <header className="auth-brand">
          <MemorialLogo className="memorial-logo" />
          <span>Cogon Memorial Records System</span>
        </header>

        <div className="auth-content">
          <section className="auth-intro">
            <p className="auth-eyebrow">Cogon · Cordova · Cebu</p>
            <h1>{pageTitle}</h1>
            <h2>{pageSubtitle}</h2>
            <p>{description}</p>
            <div className="auth-divider" />
            <div className="auth-verse">
              <span aria-hidden="true">✦</span>
              <p>Every life leaves a story worth remembering.</p>
            </div>
          </section>

          <section className="auth-form-wrap" aria-labelledby="auth-prompt-title">
            <div className="auth-card card">
              <h2 id="auth-prompt-title">{promptTitle}</h2>
              <p className="auth-subtitle">{promptDescription}</p>
              {children}
            </div>
          </section>
        </div>
      </div>
    </section>
  </main>
);

export default AuthLayout;
