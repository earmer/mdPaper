interface PerfRecord {
  label: string;
  duration: number;
  timestamp: number;
}

interface PerfAggregate {
  label: string;
  count: number;
  last: number;
  avg: number;
  max: number;
}

const MAX_RECORDS = 200;
const RECENT_WINDOW_MS = 30_000;
const STORAGE_KEY = 'mdpaper-profiler';

const perfRecords: PerfRecord[] = [];

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
};

const isStorageProfilerEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const isPerfProfilerEnabled = (): boolean => import.meta.env.DEV || isStorageProfilerEnabled();

const pushRecord = (label: string, duration: number): void => {
  if (!isPerfProfilerEnabled()) {
    return;
  }

  perfRecords.push({
    label,
    duration,
    timestamp: Date.now(),
  });

  if (perfRecords.length > MAX_RECORDS) {
    perfRecords.splice(0, perfRecords.length - MAX_RECORDS);
  }
};

export const measurePerf = <T>(label: string, task: () => T): T => {
  if (!isPerfProfilerEnabled()) {
    return task();
  }

  const start = now();

  try {
    return task();
  } finally {
    pushRecord(label, now() - start);
  }
};

export const measurePerfAsync = async <T>(label: string, task: () => Promise<T>): Promise<T> => {
  if (!isPerfProfilerEnabled()) {
    return await task();
  }

  const start = now();

  try {
    return await task();
  } finally {
    pushRecord(label, now() - start);
  }
};

const buildAggregates = (): PerfAggregate[] => {
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  const buckets = new Map<string, PerfAggregate>();

  perfRecords.forEach((record) => {
    if (record.timestamp < cutoff) {
      return;
    }

    const current = buckets.get(record.label);
    if (current === undefined) {
      buckets.set(record.label, {
        label: record.label,
        count: 1,
        last: record.duration,
        avg: record.duration,
        max: record.duration,
      });
      return;
    }

    const nextCount = current.count + 1;
    current.count = nextCount;
    current.last = record.duration;
    current.avg = ((current.avg * (nextCount - 1)) + record.duration) / nextCount;
    current.max = Math.max(current.max, record.duration);
  });

  return [...buckets.values()].sort((left, right) => right.last - left.last);
};

const formatMs = (value: number): string => `${value.toFixed(value >= 10 ? 1 : 2)}ms`;

export const getPerfSummaryLines = (limit = 10): string[] => {
  if (!isPerfProfilerEnabled()) {
    return ['profiler=disabled'];
  }

  const aggregates = buildAggregates().slice(0, limit);

  if (aggregates.length === 0) {
    return ['profiler=enabled recent=none'];
  }

  return [
    `profiler=enabled window=${RECENT_WINDOW_MS / 1000}s records=${perfRecords.length}`,
    ...aggregates.map((item) => `${item.label} last=${formatMs(item.last)} avg=${formatMs(item.avg)} max=${formatMs(item.max)} count=${item.count}`),
  ];
};

