'use client'

import Link from 'next/link'
import { GraphVisualizer } from './GraphVisualizer'
import { useMemo, useState } from 'react'

type Memory = { id: string; title: string; category: string }
type Entity = { id: string; name: string; type: string }
type Edge = { memory_id: string; entity_id: string; relationship: string }

export function MemoryConnections({
  memories,
  entities,
  memoryEntities,
}: {
  memories: Memory[]
  entities: Entity[]
  memoryEntities: Edge[]
}) {
  const [overview, setOverview] = useState(false)
  const [selected, setSelected] = useState(memories[0]?.id || '')
  const [entityKey, setEntityKey] = useState('')
  const memory = memories.find((m) => m.id === selected)
  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities])
  const edges = memoryEntities.filter((edge) => edge.memory_id === selected)
  const neighbors = new Map<string, { entity: Entity; roles: Set<string> }>()
  for (const edge of edges) {
    const entity = byId.get(edge.entity_id)
    if (!entity) continue
    const key = entity.name.trim().toLowerCase()
    const node = neighbors.get(key) || { entity, roles: new Set<string>() }
    if (edge.relationship) node.roles.add(edge.relationship)
    neighbors.set(key, node)
  }
  const selectedEntity = neighbors.get(entityKey)
  const relatedIds = new Set(
    memoryEntities
      .filter((edge) => byId.get(edge.entity_id)?.name.trim().toLowerCase() === entityKey)
      .map((edge) => edge.memory_id),
  )
  const related = memories.filter((m) => m.id !== selected && relatedIds.has(m.id))
  function selectMemory(id: string) {
    setSelected(id)
    setEntityKey('')
  }
  if (!memory)
    return (
      <div className="p-8">
        Capture a source to start your graph.{' '}
        <Link className="text-primary underline" href="/capture">
          Capture a source
        </Link>
      </div>
    )
  return (
    <section className="graph-workbench">
      <div className="graph-switch" role="group" aria-label="Graph view">
        {['Explore a source', 'All connections'].map((label, index) => (
          <button
            key={label}
            aria-pressed={overview === Boolean(index)}
            className="rounded-full border px-4 py-2 text-sm aria-pressed:bg-primary/15 aria-pressed:text-primary"
            onClick={() => setOverview(Boolean(index))}
          >
            {label}
          </button>
        ))}
      </div>
      {overview ? (
        <div className="graph-overview">
          <GraphVisualizer memories={memories} entities={entities} memoryEntities={memoryEntities} />
        </div>
      ) : (
        <>
          <label className="graph-select">
            Explore a memory
            <select
              value={selected}
              onChange={(e) => selectMemory(e.target.value)}
              className="block w-full rounded-lg border bg-card p-3"
            >
              {memories.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          <div className="graph-map">
            <div className="graph-origin">
              <div className="text-xs font-medium">{memory.category}</div>
              <h2 className="mt-1 text-xl font-medium">{memory.title}</h2>
              <Link
                href={'/ask?memory=' + memory.id}
                className="mt-4 inline-block text-sm underline"
              >
                Ask about this memory
              </Link>
            </div>
            <div className="graph-branches">
              {Array.from(neighbors, ([key, { entity, roles }]) => (
                <button
                  key={key}
                  onClick={() => setEntityKey(key)}
                  aria-pressed={entityKey === key}
                  className="relative block w-full rounded-lg border bg-card px-4 py-3 text-left before:absolute before:-left-6 before:top-1/2 before:w-6 before:border-t before:border-primary/35 aria-pressed:border-primary"
                >
                  <span className="block text-xs text-muted-foreground">
                    {[...roles].join(' · ') || entity.type}
                  </span>
                  {entity.name}
                </button>
              ))}
              {!neighbors.size && (
                <p className="text-sm text-muted-foreground">This source has no extracted entities.</p>
              )}
            </div>
          </div>
          {selectedEntity && (
            <div className="border-t pt-4">
              <h3 className="font-medium">Other memories mentioning {selectedEntity.entity.name}</h3>
              {related.length ? (
                related.map((m) => (
                  <button
                    className="mr-4 mt-2 text-sm text-primary underline"
                    key={m.id}
                    onClick={() => selectMemory(m.id)}
                  >
                    {m.title}
                  </button>
                ))
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">This is the only connected memory.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
