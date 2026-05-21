import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserProvider, useUser } from './hooks/useUser'
import { ThemeProvider } from './hooks/useTheme'
import Layout from './components/Layout'
import AppPinLock from './components/AppPinLock'
import UserPicker from './views/UserPicker'
import Journal from './views/Journal'
import EntryDetail from './views/EntryDetail'
import Explore from './views/Explore'
import Lists from './views/Lists'
import CategoryDetail from './views/CategoryDetail'
import BookOfFood from './views/BookOfFood'
import RecipeDetail from './views/RecipeDetail'
import ItemDetail from './views/ItemDetail'
import OnThisDay from './views/OnThisDay'
import CreateTrip from './views/CreateTrip'
import TripDetail from './views/TripDetail'
import Baby from './views/Baby'
import Settings from './views/Settings'
import FamilyFeed from './views/FamilyFeed'
import BabyShower from './views/BabyShower'
import ShowerManage from './views/ShowerManage'
import Registry from './views/Registry'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
})

function RequireUser({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  if (!user) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  const isShowerDomain = window.location.hostname.endsWith('leahybernierbabyshower.com')

  if (isShowerDomain) {
    return (
      <Routes>
        <Route path="/shower" element={<BabyShower />} />
        <Route path="/shower/m" element={<ShowerManage />} />
        <Route path="*" element={<Navigate to="/shower" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<AppPinLock><UserPicker /></AppPinLock>} />
      <Route path="/family" element={<FamilyFeed />} />
      <Route path="/shower" element={<BabyShower />} />
      <Route path="/shower/m" element={<ShowerManage />} />
      <Route
        element={
          <AppPinLock>
            <RequireUser>
              <Layout />
            </RequireUser>
          </AppPinLock>
        }
      >
        <Route path="/journal" element={<Journal />} />
        <Route path="/journal/:date" element={<EntryDetail />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/lists" element={<Lists />} />
        <Route path="/lists/:categoryId" element={<CategoryDetail />} />
        <Route path="/book-of-food" element={<BookOfFood />} />
        <Route path="/recipes/:recipeId" element={<RecipeDetail />} />
        <Route path="/items/:itemId" element={<ItemDetail />} />
        <Route path="/on-this-day" element={<OnThisDay />} />
        <Route path="/trips/new" element={<CreateTrip />} />
        <Route path="/trips/:tripId" element={<TripDetail />} />
        <Route path="/baby" element={<Baby />} />
        <Route path="/registry" element={<Registry />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UserProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </UserProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
