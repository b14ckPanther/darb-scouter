import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from '../ui/EmptyState'
import { ErrorScouter } from '../ui/ErrorScouter'
import { StageChip } from '../ui/StageChip'

describe('UI kit', () => {
  it('radar-empty state says the radar found nothing', () => {
    render(<EmptyState kind="radar-empty" />)
    expect(screen.getByText('Radar found nothing tonight')).toBeInTheDocument()
  })

  it('no-gaps state says there is nothing to train', () => {
    render(<EmptyState kind="no-gaps" />)
    expect(screen.getByText('Nothing to train. You match every listed skill.')).toBeInTheDocument()
  })

  it('error state is announced', () => {
    render(<ErrorScouter message="FreeHire didn't answer." />)
    expect(screen.getByRole('alert')).toHaveTextContent("FreeHire didn't answer.")
  })

  it('StageChip names the stage in plain words', () => {
    render(<StageChip stage="tech_interview" />)
    expect(screen.getByText('Tech interview')).toBeInTheDocument()
  })
})
