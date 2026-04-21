import { Routes, Route } from "react-router-dom";
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
import WorkspacePage from "./pages/WorkspacePage";
import ArchivedPage from "./pages/ArchivedPage";
import SettingsPage from "./pages/SettingsPage";
import AICalibrationPage from "./pages/AICalibrationPage";

export default function App() {
  return (
    <AppProvider>
      <Routes>
        {/* Auth callback 和 Workspace 不需要 Layout */}
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />

        <Route element={<Layout />}>
          <Route path="/" element={<InboxPage />} />
          <Route path="/new" element={<NewRecordPage />} />
          <Route path="/record/:id" element={<RecordDetailPage />} />
          <Route path="/topics" element={<TopicsPage />} />
          <Route path="/topics/:name" element={<TopicDetailPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/ai" element={<AISettingsPage />} />
          <Route path="/settings/preferences" element={<PreferencesPage />} />
          <Route path="/settings/sync" element={<SyncSettingsPage />} />
          <Route path="/synthesis/:id" element={<SynthesisDetailPage />} />
          <Route path="/briefs" element={<BriefListPage />} />
          <Route path="/brief/:id" element={<BriefDetailPage />} />
          <Route path="/archived" element={<ArchivedPage />} />
          <Route path="/lab/ai" element={<AICalibrationPage />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
