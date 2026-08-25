import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { LiveVerificationPage } from '../pages/live-verification/LiveVerificationPage';
import { IncidentHistoryPage } from '../pages/incidents/IncidentHistoryPage';
import { VoiceProfilePage } from '../pages/enrollment/VoiceProfilePage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'live-verification',
        element: <LiveVerificationPage />,
      },
      {
        path: 'incidents',
        element: <IncidentHistoryPage />,
      },
      {
        path: 'enrollment',
        element: <VoiceProfilePage />,
      },
      // Backward compatibility / legacy route redirects
      {
        path: 'live/:id',
        element: <LiveVerificationPage />,
      },
      {
        path: 'agent',
        element: <Navigate to="/live-verification" replace />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
