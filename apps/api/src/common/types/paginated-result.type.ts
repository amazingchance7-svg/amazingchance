export type PaginationMetadata = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  
  export type PaginatedResult<T> = {
    items: T[];
    pagination: PaginationMetadata;
  };