import Link from "next/link";

const NotFound = () => (
  <div className="flex min-h-screen flex-col items-center justify-center">
    <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
    <h2 className="text-xl font-semibold mb-2">Page not found</h2>
    <p className="text-gray-600 text-sm mb-6">
      The page you&apos;re looking for doesn&apos;t exist.
    </p>
    <Link
      href="/"
      className="text-sm font-medium text-[var(--primary)] hover:underline"
    >
      Go to Dashboard
    </Link>
  </div>
);

export default NotFound;
