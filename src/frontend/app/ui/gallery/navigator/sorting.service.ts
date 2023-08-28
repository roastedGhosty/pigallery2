import {Injectable} from '@angular/core';
import {DatePipe} from '@angular/common';
import {NetworkService} from '../../../model/network/network.service';
import {GalleryCacheService} from '../cache.gallery.service';
import {BehaviorSubject, Observable} from 'rxjs';
import {Config} from '../../../../../common/config/public/Config';
import {SortingMethods} from '../../../../../common/entities/SortingMethods';
import {PG2ConfMap} from '../../../../../common/PG2ConfMap';
import {ContentService, DirectoryContent} from '../content.service';
import {PhotoDTO} from '../../../../../common/entities/PhotoDTO';
import {map, switchMap} from 'rxjs/operators';
import {SeededRandomService} from '../../../model/seededRandom.service';
import {ContentWrapper} from '../../../../../common/entities/ConentWrapper';
import {SubDirectoryDTO} from '../../../../../common/entities/DirectoryDTO';
import {MediaDTO} from '../../../../../common/entities/MediaDTO';
import {FileDTO} from '../../../../../common/entities/FileDTO';

@Injectable()
export class GallerySortingService {
  public sorting: BehaviorSubject<SortingMethods>;
  public grouping: BehaviorSubject<SortingMethods>;
  private collator = new Intl.Collator(undefined, {numeric: true});

  constructor(
    private networkService: NetworkService,
    private galleryCacheService: GalleryCacheService,
    private galleryService: ContentService,
    private rndService: SeededRandomService,
    private datePipe: DatePipe
  ) {
    this.sorting = new BehaviorSubject<SortingMethods>(
      Config.Gallery.defaultPhotoSortingMethod
    );
    this.grouping = new BehaviorSubject<SortingMethods>(
      SortingMethods.ascDate // TODO: move to config
    );
    this.galleryService.content.subscribe((c) => {
      if (c) {
        const sort = this.galleryCacheService.getSorting(c);
        if (sort !== null) {
          this.sorting.next(sort);
          return;
        }
      }
      this.sorting.next(this.getDefaultSorting(c));
    });
  }

  getDefaultSorting(cw: ContentWrapper): SortingMethods {
    if (cw.directory && cw.directory.metaFile) {
      for (const file in PG2ConfMap.sorting) {
        if (cw.directory.metaFile.some((f) => f.name === file)) {
          return (PG2ConfMap.sorting as any)[file];
        }
      }
    }
    if (cw.searchResult) {
      return Config.Gallery.defaultSearchSortingMethod;
    }
    return Config.Gallery.defaultPhotoSortingMethod;
  }

  setSorting(sorting: SortingMethods): void {
    this.sorting.next(sorting);
    if (this.galleryService.content.value) {
      if (
        sorting !==
        this.getDefaultSorting(this.galleryService.content.value)
      ) {
        this.galleryCacheService.setSorting(
          this.galleryService.content.value,
          sorting
        );
      } else {
        this.galleryCacheService.removeSorting(
          this.galleryService.content.value
        );
      }
    }
  }

  setGrouping(grouping: SortingMethods): void {
    this.grouping.next(grouping);
  }

  private sortMedia(sorting: SortingMethods, media: MediaDTO[]): void {
    if (!media) {
      return;
    }
    switch (sorting) {
      case SortingMethods.ascName:
        media.sort((a: PhotoDTO, b: PhotoDTO) =>
          this.collator.compare(a.name, b.name)
        );
        break;
      case SortingMethods.descName:
        media.sort((a: PhotoDTO, b: PhotoDTO) =>
          this.collator.compare(b.name, a.name)
        );
        break;
      case SortingMethods.ascDate:
        media.sort((a: PhotoDTO, b: PhotoDTO): number => {
          return a.metadata.creationDate - b.metadata.creationDate;
        });
        break;
      case SortingMethods.descDate:
        media.sort((a: PhotoDTO, b: PhotoDTO): number => {
          return b.metadata.creationDate - a.metadata.creationDate;
        });
        break;
      case SortingMethods.ascRating:
        media.sort(
          (a: PhotoDTO, b: PhotoDTO) =>
            (a.metadata.rating || 0) - (b.metadata.rating || 0)
        );
        break;
      case SortingMethods.descRating:
        media.sort(
          (a: PhotoDTO, b: PhotoDTO) =>
            (b.metadata.rating || 0) - (a.metadata.rating || 0)
        );
        break;
      case SortingMethods.ascPersonCount:
        media.sort(
          (a: PhotoDTO, b: PhotoDTO) =>
            (a.metadata?.faces?.length || 0) - (b.metadata?.faces?.length || 0)
        );
        break;
      case SortingMethods.descPersonCount:
        media.sort(
          (a: PhotoDTO, b: PhotoDTO) =>
            (b.metadata?.faces?.length || 0) - (a.metadata?.faces?.length || 0)
        );
        break;
      case SortingMethods.random:
        this.rndService.setSeed(media.length);
        media.sort((a: PhotoDTO, b: PhotoDTO): number => {
          if (a.name.toLowerCase() < b.name.toLowerCase()) {
            return -1;
          }
          if (a.name.toLowerCase() > b.name.toLowerCase()) {
            return 1;
          }
          return 0;
        })
          .sort((): number => {
            return this.rndService.get() - 0.5;
          });
        break;
    }
    return;
  }

  public applySorting(
    directoryContent: Observable<DirectoryContent>
  ): Observable<GroupedDirectoryContent> {
    return directoryContent.pipe(
      switchMap((dirContent) => {
        return this.grouping.pipe(
          switchMap((grouping) => {
            return this.sorting.pipe(
              map((sorting) => {
                if (!dirContent) {
                  return null;
                }
                const c: GroupedDirectoryContent = {
                  mediaGroups: [],
                  directories: dirContent.directories,
                  metaFile: dirContent.metaFile,
                };
                if (c.directories) {
                  switch (sorting) {
                    case SortingMethods.ascRating: // directories do not have rating
                    case SortingMethods.ascName:
                      c.directories.sort((a, b) =>
                        this.collator.compare(a.name, b.name)
                      );
                      break;
                    case SortingMethods.ascDate:
                      if (
                        Config.Gallery.enableDirectorySortingByDate === true
                      ) {
                        c.directories.sort(
                          (a, b) => a.lastModified - b.lastModified
                        );
                        break;
                      }
                      c.directories.sort((a, b) =>
                        this.collator.compare(a.name, b.name)
                      );
                      break;
                    case SortingMethods.descRating: // directories do not have rating
                    case SortingMethods.descName:
                      c.directories.sort((a, b) =>
                        this.collator.compare(b.name, a.name)
                      );
                      break;
                    case SortingMethods.descDate:
                      if (
                        Config.Gallery.enableDirectorySortingByDate === true
                      ) {
                        c.directories.sort(
                          (a, b) => b.lastModified - a.lastModified
                        );
                        break;
                      }
                      c.directories.sort((a, b) =>
                        this.collator.compare(b.name, a.name)
                      );
                      break;
                    case SortingMethods.random:
                      this.rndService.setSeed(c.directories.length);
                      c.directories
                        .sort((a, b): number => {
                          if (a.name.toLowerCase() < b.name.toLowerCase()) {
                            return 1;
                          }
                          if (a.name.toLowerCase() > b.name.toLowerCase()) {
                            return -1;
                          }
                          return 0;
                        })
                        .sort((): number => {
                          return this.rndService.get() - 0.5;
                        });
                      break;
                  }
                }

                // group
                if (dirContent.media) {
                  const mCopy = dirContent.media;
                  this.sortMedia(grouping, mCopy);
                  let groupFN = (m: MediaDTO) => '';
                  switch (grouping) {
                    case SortingMethods.ascDate:
                    case SortingMethods.descDate:
                      groupFN = (m: MediaDTO) => this.datePipe.transform(m.metadata.creationDate, 'longDate');
                      break;
                    case SortingMethods.ascName:
                    case SortingMethods.descName:
                      groupFN = (m: MediaDTO) => m.name.at(0).toLowerCase();
                      break;
                    case SortingMethods.descRating:
                    case SortingMethods.ascRating:
                      groupFN = (m: MediaDTO) => ((m as PhotoDTO).metadata.rating || 0).toString();
                      break;
                    case SortingMethods.descPersonCount:
                    case SortingMethods.ascPersonCount:
                      groupFN = (m: MediaDTO) => ((m as PhotoDTO).metadata.faces || []).length.toString();
                      break;
                  }
                  c.mediaGroups = [];
                  for (const m of mCopy) {
                    const k = groupFN(m);
                    if (c.mediaGroups.length == 0 || c.mediaGroups[c.mediaGroups.length - 1].name != k) {
                      c.mediaGroups.push({name: k, media: []});
                    }
                    c.mediaGroups[c.mediaGroups.length - 1].media.push(m);
                  }
                  c.mediaGroups;
                }

                // sort groups
                for (let i = 0; i < c.mediaGroups.length; ++i) {
                  this.sortMedia(sorting, c.mediaGroups[i].media);
                }

                return c;
              })
            );
          })
        );
      })
    );
  }
}

export interface MediaGroup {
  name: string;
  media: MediaDTO[];
}

export interface GroupedDirectoryContent {
  directories: SubDirectoryDTO[];
  mediaGroups: MediaGroup[];
  metaFile: FileDTO[];
}


