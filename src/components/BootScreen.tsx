export function BootScreen() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          AIKIZI
        </div>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    </div>
  );
}
