import { useEffect, useRef, type ReactNode } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Home from '@/pages/home';
import NotFound from '@/pages/not-found';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the app environment.');
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#285b4f',
    colorForeground: '#35483f',
    colorMutedForeground: '#78827c',
    colorDanger: '#a94c3d',
    colorBackground: '#fbfaf6',
    colorInput: '#fffefa',
    colorInputForeground: '#35483f',
    colorNeutral: '#e2dfd6',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '9px',
  },
  elements: {
    rootBox: { width: '100%', display: 'flex', justifyContent: 'center' },
    cardBox: { width: '440px', maxWidth: '100%', overflow: 'hidden', borderRadius: '18px', backgroundColor: '#fbfaf6' },
    card: { border: '0', boxShadow: 'none', backgroundColor: 'transparent' },
    footer: { border: '0', boxShadow: 'none', backgroundColor: 'transparent' },
    headerTitle: { color: '#263d36', fontFamily: 'Manrope, sans-serif' },
    headerSubtitle: { color: '#617067', fontFamily: 'DM Sans, sans-serif' },
    socialButtonsBlockButtonText: { color: '#35483f' },
    formFieldLabel: { color: '#41534b' },
    footerActionLink: { color: '#285b4f' },
    footerActionText: { color: '#6d7971' },
    dividerText: { color: '#89928c' },
    identityPreviewEditButton: { color: '#285b4f' },
    formFieldSuccessText: { color: '#356b57' },
    alertText: { color: '#a94c3d' },
    logoBox: { marginInline: 'auto' },
    logoImage: { maxHeight: '36px' },
    socialButtonsBlockButton: { border: '1px solid #e2dfd6', backgroundColor: '#fffefa', borderRadius: '8px' },
    formButtonPrimary: { backgroundColor: '#285b4f', color: '#fffdf6', borderRadius: '9px' },
    formFieldInput: { backgroundColor: '#fffefa', color: '#35483f', border: '1px solid #e2dfd6', borderRadius: '8px' },
    footerAction: { backgroundColor: 'transparent' },
    dividerLine: { backgroundColor: '#e2dfd6' },
    alert: { backgroundColor: '#fbefeb', color: '#a94c3d' },
    otpCodeFieldInput: { backgroundColor: '#fffefa', color: '#35483f', border: '1px solid #e2dfd6' },
    formFieldRow: { paddingBlock: '4px' },
    main: { color: '#35483f' },
  },
};

function SignInPage() {
  return (
    <main className="auth-page">
      <a className="auth-brand" href={basePath || '/'} aria-label="Rezume home">Rezume</a>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </main>
  );
}

function SignUpPage() {
  return (
    <main className="auth-page">
      <a className="auth-brand" href={basePath || '/'} aria-label="Rezume home">Rezume</a>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </main>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-out"><Home /></Show>
      <Show when="signed-in"><Redirect to="/user-portal" /></Show>
    </>
  );
}

function UserPortal() {
  return (
    <>
      <Show when="signed-in"><Home /></Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        client.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);

  return null;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/user-portal" component={UserPortal} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back to Rezume', subtitle: 'Sign in to continue to your resume workspace.' } },
        signUp: { start: { title: 'Create your Rezume account', subtitle: 'Get started with your resume workspace.' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;