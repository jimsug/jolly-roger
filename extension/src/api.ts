export class HttpError extends Error {
  private status: number | undefined;

  constructor(msg: string, status?: number) {
    super(msg);
    Object.setPrototypeOf(this, HttpError.prototype);
    this.status = status;
  }

  getStatus(): number | undefined {
    return this.status;
  }
}

export interface Hunt {
  _id: string;
  name: string;
}

export type GdriveMimeTypesType = "spreadsheet" | "document";

export interface Puzzle {
  _id?: string;
  title: string;
  url: string;
  tags: string[];
  expectedAnswerCount: number;
  docType: GdriveMimeTypesType;
  hunt?: string; // Added for puzzle responses
  allowDuplicateUrls: boolean;
}

export class JollyRogerClient {
  private instance: string;

  private apiKey: string;

  constructor(instance: string, apiKey: string) {
    this.instance = instance;
    this.apiKey = apiKey;
  }

  getHunts = async () => {
    return (await this.callApi("/api/hunts")).hunts as Hunt[];
  };

  getTagsForHunt = async (hunt: string) => {
    return (await this.callApi(`/api/tags/${hunt}`)).tags as string[];
  };

  addPuzzle = async (hunt: string, puzzle: Puzzle) => {
    return (await this.callApi(`/api/createPuzzle/${hunt}`, puzzle))
      .id as string;
  };

  async findPuzzlesByUrl(url: string, hunt: string): Promise<Puzzle[]> {
    const query = new URLSearchParams({ url, hunt });
    try {
      const result = await this.callApi(`/api/puzzles?${query.toString()}`);
      return result.puzzles as Puzzle[];
    } catch (e) {
      if (e instanceof HttpError && e.getStatus() === 404) {
        return [];
      }
      throw e;
    }
  }

  async findExistingPuzzlesByUrl(
    urls: string[],
    hunt: string,
  ): Promise<Record<string, string>> {
    // This new endpoint will receive a list of URLs and return a map of
    // found URLs to their JollyRoger puzzle URL.
    const result = await this.callApi(`/api/puzzles/bulk-check`, {
      urls,
      hunt,
    });
    return result.existing as Record<string, string>;
  }

  private callApi = (endpoint: string, requestBody?: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.instance);
      const xhr = new XMLHttpRequest();
      xhr.open(requestBody ? "POST" : "GET", url);
      xhr.setRequestHeader("Authorization", `Bearer ${this.apiKey}`);
      if (requestBody) {
        xhr.setRequestHeader("Content-Type", "application/json");
      }
      xhr.onload = function () {
        if (xhr.status === 200) {
          resolve(JSON.parse(xhr.response));
        } else {
          reject(
            new HttpError(
              `HTTP error ${xhr.status} calling ${url}`,
              xhr.status,
            ),
          );
        }
      };
      xhr.onerror = function () {
        reject(new HttpError(`HTTP error calling ${url}`));
      };
      xhr.send(requestBody ? JSON.stringify(requestBody) : null);
    });
  };
}
