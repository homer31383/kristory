import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { UserProvider, useUser } from './hooks/useUser'
import { ThemeProvider } from './hooks/useTheme'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Journal from './views/Journal'
import EntryDetail from './views/EntryDetail'
import Explore from './views/Explore'
import Books from './views/Books'
import BookDetail from './views/BookDetail'
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
import FamilyPhotos from './views/FamilyPhotos'
import PhotoMemories from './views/PhotoMemories'
import LibraryRiver from './views/LibraryRiver'
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

// Drop every cached query when the account signs out, so the next person to
// sign in on this device never sees the previous account's data.
function ClearCacheOnSignOut() {
  const { status } = useUser()
  const queryClient = useQueryClient()
  useEffect(() => {
    if (status === 'signed-out') queryClient.clear()
  }, [status, queryClient])
  return null
}

function AppRoutes() {
  const isShowerDomain = window.location.hostname.endsWith('leahybernierbabyshower.com')

  if (isShowerDomain) {
    return (
      <Routes>
        <Route path="/shower" element={<BabyShower />} />
        <Route path="/shower/m" element={<RequireAuth title="Shower Manager"><ShowerManage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/shower" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<RequireAuth><Navigate to="/journal" replace /></RequireAuth>} />
      <Route
        path="/photos"
        element={
          <RequireAuth>
            <PhotoMemories />
          </RequireAuth>
        }
      />
      <Route path="/family" element={<RequireAuth title="The Babory"><FamilyFeed /></RequireAuth>} />
      <Route path="/family/photos" element={<RequireAuth title="The Babory"><FamilyPhotos /></RequireAuth>} />
      <Route
        path="/library/river"
        element={
          <RequireAuth>
            <LibraryRiver />
          </RequireAuth>
        }
      />
      <Route
        path="/library/:categoryId/river"
        element={
          <RequireAuth>
            <LibraryRiver />
          </RequireAuth>
        }
      />
      <Route path="/shower" element={<BabyShower />} />
      <Route path="/shower/m" element={<RequireAuth title="Shower Manager"><ShowerManage /></RequireAuth>} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/journal" element={<Journal />} />
        <Route path="/journal/:date" element={<EntryDetail />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/library" element={<Navigate to="/explore" replace />} />
        <Route path="/library/books" element={<Books />} />
        <Route path="/library/books/:bookId" element={<BookDetail />} />
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

// URL quick actions: /?action=new-entry. The param is stripped right away so
// a refresh does not re-trigger it. The action waits in sessionStorage through
// the sign-in screen; Journal and EntryDetail pick it up.
function takeQuickAction() {
  const params = new URLSearchParams(window.location.search)
  const action = params.get('action')
  if (!action) return
  params.delete('action')
  const qs = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash)
  if (action === 'new-entry') sessionStorage.setItem('kristory-quick-action', action)
}

export default function App() {
  useEffect(() => { takeQuickAction() }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UserProvider>
          <ClearCacheOnSignOut />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </UserProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
