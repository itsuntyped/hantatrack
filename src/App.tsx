import { HomePage } from "./pages/home";

// Root component. The site is single-page today, so this is just a thin
// wrapper that delegates to the home page. When we add routing, swap
// HomePage for the router here.
export default function App() {
  return <HomePage />;
}
