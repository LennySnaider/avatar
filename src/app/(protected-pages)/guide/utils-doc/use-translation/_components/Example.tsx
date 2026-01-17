import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'

const Example = () => {
    return (
        <SyntaxHighlighter language="js">{`import useTranslation from '@/utils/hooks/useTranslation

const Example = () => {
    const { t } = useTranslation()

    return (
        <div>
            {t('hello')}
        </div>
    );
};

export default Example
`}</SyntaxHighlighter>
    )
}

export default Example
