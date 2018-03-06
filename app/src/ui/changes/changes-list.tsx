import * as React from 'react'
import * as Path from 'path'
import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'
import { List, ClickSource } from '../lib/list'

import {
  AppFileStatus,
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { CommitIdentity } from '../../models/commit-identity'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { ICommitMessage } from '../../lib/app-state'
import { IGitHubUser } from '../../lib/databases'
import { Dispatcher } from '../../lib/dispatcher'
import { IAutocompletionProvider } from '../autocompletion'
import { Repository } from '../../models/repository'
import { showContextualMenu, IMenuItem } from '../main-process-proxy'
import { IAuthor } from '../../models/author'
import { ITrailer } from '../../lib/git/interpret-trailers'

const RowHeight = 29

const GitIgnoreFileName = '.gitignore'

const RestrictedFileExtensions = ['.cmd', '.exe', '.bat', '.sh']

interface IChangesListProps {
  readonly repository: Repository
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedFilesID: string[]
  readonly onFileSelectionChanged: (row: number | number[]) => void
  readonly onIncludeChanged: (path: string, include: boolean) => void
  readonly onSelectAll: (selectAll: boolean) => void
  readonly onCreateCommit: (
    summary: string,
    description: string | null,
    trailers?: ReadonlyArray<ITrailer>
  ) => Promise<boolean>
  readonly onDiscardChanges: (file: WorkingDirectoryFileChange) => void
  readonly onDiscardAllChanges: (
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ) => void

  /**
   * Called to reveal a file in the native file manager.
   * @param path The path of the file relative to the root of the repository
   */
  readonly onRevealInFileManager: (path: string) => void

  /**
   * Called to open a file it its default application
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenItem: (path: string) => void
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly gitHubUser: IGitHubUser | null
  readonly dispatcher: Dispatcher
  readonly availableWidth: number
  readonly isCommitting: boolean

  /**
   * Click event handler passed directly to the onRowClick prop of List, see
   * List Props for documentation.
   */
  readonly onRowClick?: (row: number, source: ClickSource) => void

  readonly commitMessage: ICommitMessage | null
  readonly contextualCommitMessage: ICommitMessage | null

  /** The autocompletion providers available to the repository. */
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>

  /** Called when the given pattern should be ignored. */
  readonly onIgnore: (pattern: string | string[]) => void

  /**
   * Whether or not to show a field for adding co-authors to
   * a commit (currently only supported for GH/GHE repositories)
   */
  readonly showCoAuthoredBy: boolean

  /**
   * A list of authors (name, email pairs) which have been
   * entered into the co-authors input box in the commit form
   * and which _may_ be used in the subsequent commit to add
   * Co-Authored-By commit message trailers depending on whether
   * the user has chosen to do so.
   */
  readonly coAuthors: ReadonlyArray<IAuthor>
}

export class ChangesList extends React.Component<IChangesListProps, {}> {
  private onIncludeAllChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    this.props.onSelectAll(include)
  }

  private renderRow = (row: number): JSX.Element => {
    const file = this.props.workingDirectory.files[row]
    const selection = file.selection.getSelectionType()

    const includeAll =
      selection === DiffSelectionType.All
        ? true
        : selection === DiffSelectionType.None ? false : null

    return (
      <ChangedFile
        path={file.path}
        status={file.status}
        oldPath={file.oldPath}
        include={includeAll}
        key={file.id}
        onContextMenu={this.onItemContextMenu}
        onIncludeChanged={this.props.onIncludeChanged}
        availableWidth={this.props.availableWidth}
      />
    )
  }

  private get includeAllValue(): CheckboxValue {
    const includeAll = this.props.workingDirectory.includeAll
    if (includeAll === true) {
      return CheckboxValue.On
    } else if (includeAll === false) {
      return CheckboxValue.Off
    } else {
      return CheckboxValue.Mixed
    }
  }

  private onDiscardAllChanges = () => {
    this.props.onDiscardAllChanges(this.props.workingDirectory.files)
  }

  private onDiscardChanges = (paths: string | string[]) => {
    const workingDirectory = this.props.workingDirectory

    if (paths instanceof Array) {
      const files: WorkingDirectoryFileChange[] = []
      paths.forEach(path => {
        const file = workingDirectory.files.find(f => f.path === path)
        if (file) {
          files.push(file)
        }
      })
      if (files.length) {
        this.props.onDiscardAllChanges(files)
      }
    } else {
      const file = workingDirectory.files.find(f => f.path === paths)
      if (!file) {
        return
      }

      this.props.onDiscardChanges(file)
    }
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Discard All Changes…' : 'Discard all changes…',
        action: this.onDiscardAllChanges,
        enabled: this.props.workingDirectory.files.length > 0,
      },
    ]

    showContextualMenu(items)
  }

  private onItemContextMenu = (
    target: string,
    status: AppFileStatus,
    event: React.MouseEvent<any>
  ) => {
    event.preventDefault()

    const fileList = this.props.workingDirectory.files
    const selectedFiles: WorkingDirectoryFileChange[] = []
    this.props.selectedFilesID.forEach(fileID => {
      const newFile = fileList.find(file => file.id === fileID)
      if (newFile) {
        selectedFiles.push(newFile)
      }
    })

    const paths = selectedFiles.map(file => file.path)
    const fileName = selectedFiles.map(file => Path.basename(file.path))
    let extensions = selectedFiles.map(file => Path.extname(file.path))
    const seen: any = {}
    extensions = extensions.filter(function(item) {
      return seen.hasOwnProperty(item) ? false : (seen[item] = true)
    })

    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Discard Changes…' : 'Discard changes…',
        action: () => this.onDiscardChanges(paths),
      },
      { type: 'separator' },
    ]

    if (fileName.length === 1) {
      items.push({
        label: 'Ignore',
        action: () => this.props.onIgnore(target),
        enabled: fileName[0] !== GitIgnoreFileName,
      })
    } else if (fileName.length > 1) {
      items.push({
        label: 'Ignore all',
        action: () => {
          this.props.onIgnore(paths)
          // paths.forEach((path, index) => {
          //   if (fileName[index] && fileName[index] !== GitIgnoreFileName) {
          //     this.props.onIgnore(path)
          //   }
          // })
        },
        enabled: fileName[0] !== GitIgnoreFileName,
      })
    }

    extensions.forEach(extension => {
      if (extension) {
        items.push({
          label: __DARWIN__
            ? `Ignore All ${extension} Files`
            : `Ignore all ${extension} files`,
          action: () => this.props.onIgnore(`*${extension}`),
        })
      }
    })

    const isSafeExtension = __WIN32__
      ? extensions.every(
          extension =>
            !RestrictedFileExtensions.includes(extension.toLowerCase())
        )
      : true

    const revealInFileManagerLabel = __DARWIN__
      ? 'Reveal in Finder'
      : __WIN32__ ? 'Show in Explorer' : 'Show in your File Manager'

    items.push(
      { type: 'separator' },
      {
        label: revealInFileManagerLabel,
        action: () => this.props.onRevealInFileManager(target),
        enabled: status !== AppFileStatus.Deleted,
      },
      {
        label: __DARWIN__
          ? 'Open with Default Program'
          : 'Open with default program',
        action: () => this.props.onOpenItem(target),
        enabled: isSafeExtension && status !== AppFileStatus.Deleted,
      }
    )

    showContextualMenu(items)
  }

  public render() {
    const fileList = this.props.workingDirectory.files
    const selectedRows: number[] = []
    this.props.selectedFilesID.forEach(fileID => {
      selectedRows.push(fileList.findIndex(file => file.id === fileID))
    })
    const fileCount = fileList.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesDescription = `${fileCount} changed ${filesPlural}`
    const anyFilesSelected =
      fileCount > 0 && this.includeAllValue !== CheckboxValue.Off

    return (
      <div className="changes-list-container file-list">
        <div className="header" onContextMenu={this.onContextMenu}>
          <Checkbox
            label={filesDescription}
            value={this.includeAllValue}
            onChange={this.onIncludeAllChanged}
            disabled={fileCount === 0}
          />
        </div>

        <List
          id="changes-list"
          rowCount={this.props.workingDirectory.files.length}
          rowHeight={RowHeight}
          rowRenderer={this.renderRow}
          selectedRows={selectedRows}
          onSelectionChanged={this.props.onFileSelectionChanged}
          invalidationProps={this.props.workingDirectory}
          onRowClick={this.props.onRowClick}
        />

        <CommitMessage
          onCreateCommit={this.props.onCreateCommit}
          branch={this.props.branch}
          gitHubUser={this.props.gitHubUser}
          commitAuthor={this.props.commitAuthor}
          anyFilesSelected={anyFilesSelected}
          repository={this.props.repository}
          dispatcher={this.props.dispatcher}
          commitMessage={this.props.commitMessage}
          contextualCommitMessage={this.props.contextualCommitMessage}
          autocompletionProviders={this.props.autocompletionProviders}
          isCommitting={this.props.isCommitting}
          showCoAuthoredBy={this.props.showCoAuthoredBy}
          coAuthors={this.props.coAuthors}
        />
      </div>
    )
  }
}
