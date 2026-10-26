export function ErrorScouter({ message }: { message: string }) {
  return (
    <div className="error-scouter" role="alert">
      <span className="error-lens" aria-hidden="true" />
      <p className="error-title">The scouter couldn't read this</p>
      <p className="error-body">{message}</p>
    </div>
  )
}
