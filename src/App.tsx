import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Navigation } from './components/Navigation';
import { BootScreen } from './components/BootScreen';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { ExplorePage } from './pages/ExplorePage';
import { PostDetailPage } from './pages/PostDetailPage';
import { DecodePage } from './pages/DecodePage';
import { PricingPage } from './pages/PricingPage';
import { GuidePage } from './pages/GuidePage';
import { InvestorsPage } from './pages/InvestorsPage';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { PublisherProfilePage } from './pages/PublisherProfilePage';
import { MePage } from './pages/MePage';
import { HistoryPage } from './pages/HistoryPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';

function AppContent() {
  const { authReady } = useAuth();

  return (
    <>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/*"
          element={
            authReady ? (
              <Routes>
                <Route path="/" element={<><Navigation /><LandingPage /></>} />
                <Route path="/pricing" element={<><Navigation /><PricingPage /></>} />
                <Route path="/guide" element={<><Navigation /><GuidePage /></>} />
                <Route path="/investors" element={<><Navigation /><InvestorsPage /></>} />
                <Route path="/legal/terms" element={<><Navigation /><TermsPage /></>} />
                <Route path="/legal/privacy" element={<><Navigation /><PrivacyPage /></>} />

                <Route
                  path="/explore"
                  element={
                    <>
                      <Navigation />
                      <ProtectedRoute>
                        <ExplorePage />
                      </ProtectedRoute>
                    </>
                  }
                />
                <Route
                  path="/p/:id"
                  element={
                    <>
                      <Navigation />
                      <ProtectedRoute>
                        <PostDetailPage />
                      </ProtectedRoute>
                    </>
                  }
                />
                <Route
                  path="/decode"
                  element={
                    <>
                      <Navigation />
                      <ProtectedRoute>
                        <DecodePage />
                      </ProtectedRoute>
                    </>
                  }
                />
                <Route
                  path="/u/:handle"
                  element={
                    <>
                      <Navigation />
                      <ProtectedRoute>
                        <PublisherProfilePage />
                      </ProtectedRoute>
                    </>
                  }
                />
                <Route
                  path="/me"
                  element={
                    <>
                      <Navigation />
                      <ProtectedRoute>
                        <MePage />
                      </ProtectedRoute>
                    </>
                  }
                />
                <Route
                  path="/history"
                  element={
                    <>
                      <Navigation />
                      <ProtectedRoute>
                        <HistoryPage />
                      </ProtectedRoute>
                    </>
                  }
                />
                <Route path="*" element={<><Navigation /><NotFoundPage /></>} />
              </Routes>
            ) : (
              <BootScreen />
            )
          }
        />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
