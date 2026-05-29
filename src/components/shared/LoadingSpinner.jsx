export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <p className="text-text-secondary dark:text-text-secondary font-body text-sm">{message}</p>
    </div>
  )
}
