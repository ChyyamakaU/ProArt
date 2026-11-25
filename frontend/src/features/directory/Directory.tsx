import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { Feedback, Loading } from '../../components/ui';
import { WorkerCard } from '../../components/WorkerCard';
import { describeApiError, getWorkerFilters, listWorkers, searchSchema, type WorkerFilters } from '../../lib/api';
import { usePageMetadata } from '../../lib/usePageMetadata';

const maxOffset = 10_000;

function SearchForm({ filters, onSearch, trades, locations, suggestionsUnavailable }: {
  filters: WorkerFilters;
  onSearch: (filters: WorkerFilters) => void;
  trades?: string[];
  locations?: string[];
  suggestionsUnavailable: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<WorkerFilters>({
    defaultValues: filters, values: filters, resolver: zodResolver(searchSchema),
  });
  return <form className="surface search-form" aria-label="Search workers" onSubmit={handleSubmit(onSearch)}>
    <div>
      <label htmlFor="worker-query">Search</label>
      <input id="worker-query" type="search" placeholder="Name or keyword" maxLength={100} {...register('q')}
        aria-invalid={Boolean(errors.q)} aria-describedby={errors.q ? 'worker-query-error' : undefined} />
      {errors.q && <p id="worker-query-error" role="alert">{errors.q.message}</p>}
    </div>
    <div>
      <label htmlFor="worker-trade">Trade</label>
      <input id="worker-trade" list={trades?.length ? 'trade-options' : undefined} placeholder="e.g. Electrician"
        maxLength={80} {...register('trade')} aria-invalid={Boolean(errors.trade)}
        aria-describedby={errors.trade ? 'worker-trade-error' : undefined} />
      {!!trades?.length && <datalist id="trade-options">{trades.map(trade => <option key={trade} value={trade} />)}</datalist>}
      {errors.trade && <p id="worker-trade-error" role="alert">{errors.trade.message}</p>}
    </div>
    <div>
      <label htmlFor="worker-location">Location</label>
      <input id="worker-location" list={locations?.length ? 'location-options' : undefined} placeholder="e.g. Abuja"
        maxLength={120} {...register('location')} aria-invalid={Boolean(errors.location)}
        aria-describedby={errors.location ? 'worker-location-error' : undefined} />
      {!!locations?.length && <datalist id="location-options">{locations.map(location => <option key={location} value={location} />)}</datalist>}
      {errors.location && <p id="worker-location-error" role="alert">{errors.location.message}</p>}
    </div>
    <button className="button primary" type="submit"><Search size={18} aria-hidden="true" /> Search</button>
    {suggestionsUnavailable && <small className="filter-note" role="status">Suggestions are unavailable. You can still type a trade or location.</small>}
  </form>;
}

export function Directory() {
  const [params, setParams] = useSearchParams();
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  usePageMetadata('Worker directory | ProArt', 'Search ProArt’s public Trust Cards by name, trade, or location.');
  const filters = {
    q: (params.get('q') ?? '').trim().slice(0, 100),
    trade: (params.get('trade') ?? '').trim().slice(0, 80),
    location: (params.get('location') ?? '').trim().slice(0, 120),
  };
  const rawOffset = Number(params.get('offset') ?? 0);
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 && rawOffset <= maxOffset ? rawOffset : 0;
  const query = useQuery({
    queryKey: ['workers', filters, offset],
    queryFn: ({ signal }) => listWorkers(filters, offset, signal),
  });
  const suggestions = useQuery({
    queryKey: ['worker-filters'],
    queryFn: ({ signal }) => getWorkerFilters(signal),
    staleTime: 5 * 60_000,
  });

  function update(next: WorkerFilters, pageOffset = 0) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) search.set(key, value);
    if (pageOffset > 0) search.set('offset', String(pageOffset));
    setParams(search);
    resultsHeading.current?.focus();
  }

  const result = query.data;
  const hasFilters = Object.values(filters).some(Boolean);
  const directorySearch = params.size ? '?' + params.toString() : '';
  const summary = result && !query.isError
    ? (result.pagination.total + (result.pagination.total === 1 ? ' professional found' : ' professionals found')
      + (result.data.length ? ' · Showing ' + (offset + 1) + '–' + (offset + result.data.length) : ''))
    : '';

  return <>
    <section className="page-intro"><div className="shell">
      <p className="eyebrow">Professional directory</p>
      <h1>Find skilled professionals.</h1>
      <p>Search by trade, location, or name. Open a Trust Card to see a professional’s work, reviews and any approved verification.</p>
    </div></section>
    <div className="shell directory">
      <SearchForm filters={filters} onSearch={update} trades={suggestions.data?.trades}
        locations={suggestions.data?.locations} suggestionsUnavailable={suggestions.isError && !query.isError} />
      <section className="directory-results" aria-labelledby="results-heading">
        <div className="results-bar">
          <h2 id="results-heading" ref={resultsHeading} tabIndex={-1}>Search results</h2>
          {hasFilters && <button className="text-link" type="button" onClick={() => update({ q: '', trade: '', location: '' })}>Clear filters</button>}
        </div>
        <p className="result-summary" role="status" aria-atomic="true">{summary}</p>
        {query.isPending && <Loading label="Loading workers" cards={6} />}
        {query.isError && <Feedback error title="Couldn’t load the directory"
          action={<button className="button secondary" onClick={() => void query.refetch()}>Try again</button>}>
          {describeApiError(query.error)}
        </Feedback>}
        {result && !query.isError && <>
          {result.data.length ? <div className="results-grid">{result.data.map(worker => <WorkerCard worker={worker} directorySearch={directorySearch} key={worker.slug} />)}</div>
            : <Feedback title={hasFilters ? 'No matching workers' : 'No profiles here yet'}
              action={offset > 0 ? <button className="button secondary" onClick={() => update(filters)}>Back to first page</button> : undefined}>
              {hasFilters ? 'Try a shorter search or broaden your filters.' : 'Check back when more professionals have joined.'}
            </Feedback>}
          {(offset > 0 || result.pagination.has_more) && <nav className="pagination" aria-label="Directory pagination">
            <button className="button secondary" disabled={offset === 0} onClick={() => update(filters, Math.max(0, offset - result.pagination.limit))}>Previous</button>
            <button className="button secondary" disabled={!result.pagination.has_more || offset + result.pagination.limit > maxOffset} onClick={() => update(filters, offset + result.pagination.limit)}>Next</button>
          </nav>}
        </>}
      </section>
    </div>
  </>;
}
