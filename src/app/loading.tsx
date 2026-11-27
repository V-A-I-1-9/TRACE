export default function Loading() {
  return (
    <div role="status" className="workspace-page route-loading">
      <span className="sr-only">Loading page</span>
      <div aria-hidden="true" className="route-placeholder">
        <div className="placeholder-heading" />
        <div className="placeholder-list">
          {[0, 1, 2].map(row => (
            <div className="placeholder-row" key={row}>
              <i /><div><b /><b /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
