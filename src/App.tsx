import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./context";
import Layout from "./components/Layout";
import InboxPage from "./pages/InboxPage";
import NewRecordPage from "./pages/NewRecordPage";
import RecordDetailPage from "./pages/RecordDetailPage";
import TopicsPage from "./pages/TopicsPage";
import TopicDetailPage from "./pages/TopicDetailPage";
import ReviewPage from "./pages/ReviewPage";
import AISettingsPage from "./pages/AISettingsPage";
import PreferencesPage from "./pages/PreferencesPage";
import SynthesisDetailPage from "./pages/SynthesisDetailPage";
import BriefListPage from "./pages/BriefListPage";
import BriefDetailPage from "./pages/BriefDetailPage";
import SyncSettingsPage from "./pages/SyncSettingsPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          {/* Auth callback 不需要 Layout */}
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          
          <Route element={<Layout />}>
            <Route path="/" element={<InboxPage />} />
            <Route path="/new" element={<NewRecordPage />} />
            <Route path="/record/:id" element={<RecordDetailPage />} />
            <Route path="/topics" element={<TopicsPage />} />
            <Route path="/topics/:name" element={<TopicDetailPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/settings/ai" element={<AISettingsPage />} />
            <Route path="/settings/preferences" element={<PreferencesPage />} />
            <Route path="/settings/sync" element={<SyncSettingsPage />} />
            <Route path="/synthesis/:id" element={<SynthesisDetailPage />} />
            <Route path="/briefs" element={<BriefListPage />} />
            <Route path="/brief/:id" element={<BriefDetailPage />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
