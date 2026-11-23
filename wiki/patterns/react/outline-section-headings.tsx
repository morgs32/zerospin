/**
 * Render section headings outside ordered lists. Give each section its own
 * list so the markers start again. Set the marker type on the list and leave
 * numbers and letters out of label text.
 *
 * @bad Render Repos as a list item in the Admin section.
 * @bad Hardcode numbers or letters in labels instead of using list markers.
 */
export function StudioSections() {
  return (
    <>
      <h1>Admin</h1>
      <ol aria-label="Admin">
        <li>
          Aggregates
          <ol type="A">
            <li>user: 1</li>
          </ol>
          <p role="status">Loading more aggregates...</p>
        </li>
      </ol>

      <h1>Repos</h1>
      <ol aria-label="Repos" type="A">
        <li>SystemRepo</li>
        <li>AggregateVersionRepo</li>
      </ol>
    </>
  );
}
